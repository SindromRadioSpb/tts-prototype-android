# Atlas 97001: mobile tab memory, 2026-11-06

Source: `f9077e0a` / production 3.11.862. Owner reported Chrome on iPhone
crashing on first corpus entry and after several minutes in Steels (154–191).
The screenshot is a browser tab failure, without an OS termination log; the
specific device's termination reason is therefore not proven.

## Findings and change

1. A cold atlas entry awaited unpacking/importing `canon-v4.zip`, an unrelated
   literary collection. Atlas entry now reads existing local data without
   unpacking that ZIP. Opening a literary/accessible shelf still imports it via
   the existing serial queue and write gate. Existing learner data is retained.
2. Native lazy image loading never evicted scans after scrolling. The Steels
   section contains 38 pages and 90 image elements. The controlled Chromium
   traversal accumulated 401,835,000 bytes of decoded image RGBA dimensions
   (383.2 MiB). This is an image residency estimate, not total process RSS.
3. The reader now assigns image sources within 900 px of the viewport and
   releases them beyond it. Width/height remain reserved; returning restores
   the source. Full originals/figure links and the separate print renderer keep
   their original resolution. No supplier data or production volume changed.
4. Leaving the section releases its image observer, word host and listeners;
   leaving the corpus also destroys tracking/audio and rejects stale navigation.

## Reproduction and evidence

`node scripts/atlas/atlas-mobile-memory-smoke.cjs --baseline`

`node scripts/atlas/atlas-mobile-memory-smoke.cjs`

`node scripts/atlas/atlas-mobile-memory-smoke.cjs --webkit`

Candidate mode routes only the two changed JS modules over the public site;
baseline mode pins those two modules to `f9077e0a` via Git so the comparison can
be repeated after deployment (the original baseline JSON was captured before
the production update).
Each run uses an anonymous disposable browser profile with service workers
blocked. It traverses all 38 Steels pages at 390×844 / DPR 3, jumps back to
157, reloads the evicted scan, opens a word card, verifies 38 print sheets / 50
print figures, and imports the literary canon on explicit shelf navigation.
No owner profile or paid provider is used.

| Measurement | Baseline Chromium | Candidate Chromium | Candidate WebKit |
|---|---:|---:|---:|
| Cold contents visible | 31.0 s | 4.0 s | 6.0 s |
| Maximum image sources | 90 | 6 | 6 |
| Maximum decoded image estimate | 383.2 MiB | 19.1 MiB | 19.1 MiB |
| Page errors | 0 | 0 | 0 |

Individual measurements are in the adjacent JSON files. Timings are single
networked runs, not a statistical benchmark. WebKit automation on Windows is
not a physical iPhone test. The actual iPhone crash was not reproduced here;
the measured excessive allocations and residency were reproduced and reduced.

Validation: affected atlas, cold boot, import queue, SW, shell integrity and
version tests: 208 passed, 1 pre-existing optional corpus-data skip, 0 failed.
i18n: 233 passed. Image residency regression test covers eviction, restoration,
reserved dimensions and cleanup.

## Production

Released `19d99822` as 3.11.863. No-cache config and all 207 integrity keys
matched HTTP bytes; the changed modules, Room shell and SW matched local files
byte for byte. Three health samples: OK, DB and migrations ready. The server and
the activated, controlling service worker both report 3.11.863 (`GET_VERSION`).
The runtime and previous known-good image were retained. Available disk after bounded cleanup:
6,864,547,840 bytes; the existing 80% disk warning remains (O-047).

Both **live**, unmodified-module mobile runs completed all 38 pages, return to
157, word card, print structure and on-demand canon import without page errors.
Both peaked at 6 image sources / 20,016,976 RGBA bytes. Raw evidence:
`production-chromium.json`, `production-webkit.json`, `release-verification.json`.
Production cold-open timings were 14.6 s and 5.0 s respectively: concurrent
networked runs vary; the memory limit is the reproducible result. A separate
narrow-viewport visual inspection showed the scan, bilingual text and table intact.

Full unit suite: 3403 passed, 2 optional skips, 0 failed. CI first exposed a VM
test harness missing the new teardown helper; the harness now loads the real
helper (`7fb07a3a`). Course gate: 327 passed, zero validator errors, 23 existing
warnings, all 24 legacy source files unchanged under Git normalization.
The checkout checks now handle CRLF without treating it as edited course data.

Final CI on `7fb07a3a`: all three jobs passed (`smoke`, `cafe-b-pilot`,
`studio-background`), [run 42162741548](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/42162741548).
The pinned baseline was replayed after deployment: 90 sources and 410,864,568
RGBA bytes (391.8 MiB), zero page errors (`baseline-reproduced-chromium.json`).
The reproduction helper's buffer supports the 1.15 MB Room module and always
closes its browser after a setup failure. It is diagnostic only.
Final health at 04:35:23 UTC (uptime 678 s): OK, DB/migrations ready.

### Limits and separate findings

The broader existing 97002 search browser smoke did **not** pass: two current
production attempts timed out after injected-503 recovery (`:195`); a control
using both JS modules from the pre-fix `f9077e0a` also timed out (phrase query,
`:144`). Its six-case acceptance is not claimed. Late presentation remount can
also display contents while a direct section URL remains in the address.
These were recorded separately as O-149/O-150, with causes still to investigate
where unproven. They do not invalidate the completed 97001 memory traversal,
but are not presented as fixed by this release.

Physical iPhone/Chrome confirmation is still required to establish that the
owner's specific crash no longer occurs; no OS termination log was available.
