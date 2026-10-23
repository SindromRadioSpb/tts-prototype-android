# Reading Room: responsive long material opening

Date: 2026-10-23. Base revision: `e72ba44836be1689a56c80a99bbbdc62ab886b49`.
Evidence: isolated Chromium against a disposable local server; production verification pending.
Exact numeric observations and tested asset hashes: [measurements.json](measurements.json).

## Latest complete acceptance run

The final complete run includes the additional short material with long paragraphs and stored contextual translations. All existing desktop/mobile/RTL, search, resume, cancellation, manual transliteration and replay-identity checks passed again. Five host-level VM regression tests execute the actual `applyDecorations` / `applyWordLayer` functions: contextual display starts after row hydration and before pending statuses/morphology decoration; superseded work cannot publish due statistics or coverage.

For the 2,500-row fixture: data 332.17 ms; table DOM paint 501.09 ms; first interactive visible Hebrew word 1911.30 ms; open completion 2173.00 ms; longest observed task 1016 ms. The interactive-word delay after data is **1579.13 ms**, so the one-second interaction goal remains unmet. DOM paint after data is 168.92 ms. Desktop resume reached the visible saved row at 2897.50 ms; mobile-viewport resume at 3206.76 ms. The profile-change probe took 710.25 ms, with a longest observed task of 77 ms.

The added generated fixture has 34 paragraphs of 100 Hebrew words, plus one unique final search word. Its 3,401 canonical pointed word spans have imported contextual glosses: 34 manual and 3,367 AI-labelled fixture entries. Both provenance and manual values survive lazy wrapping with generation disabled. The first stored contextual gloss appeared after 510.45 ms, the first visible one after 510.55 ms, and full coverage after 1448.97 ms. The row-zero word card displayed the correct Hebrew word and manual context; search reached paragraph 33 with its own manual value. No `/api/word-gloss-ctx` generation request was attempted. The fixture verifies display, preservation and scheduling; its synthetic strings are not linguistic-quality evidence.

After this browser checkpoint, two final race guards were added: contextual work invalidates on actual table replacement during a same-material rerender, and morphology clears only its own due tooltip while preserving contextual titles. The parent agent reports 2838/2838 full unit tests and 37/37 final focused tests, including the new guard regressions. The browser flow was not rerun after these two guards.

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

Pending. Local automated evidence above does not establish the served production version or production behaviour.
