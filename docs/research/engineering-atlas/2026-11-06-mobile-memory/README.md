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
each run uses an anonymous disposable browser profile with service workers
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

Production release/verification is recorded below after deployment.
