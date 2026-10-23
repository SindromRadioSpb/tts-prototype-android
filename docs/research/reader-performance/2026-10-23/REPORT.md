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

Pre-deploy inventory: 4.21 GiB available, no active build, 14 images/11 running containers/4 active volumes. Authorized build-cache cleanup reported 0 B; runtime 814 and rollback 813 remain. The existing disk warning is unresolved. Production verification is pending for this candidate.
