# Materials PB2 public TTS — implementation evidence

Date: 2026-09-01
Status: `PRODUCTION_RELEASE_VERIFIED · OWNER_ACCEPTANCE_PENDING`

## Delivered contract

- one content-addressed public cache for Reading Room and Studio;
- separate `row` and `word` semantic assets;
- row MP3 and timing sidecar returned by one provider synthesis request;
- immutable exact-edition row references and a lazy public word index;
- cached-only public playback with no learner key and no read-time synthesis;
- solution-table morphology, row playback and section playback;
- ordinary condition-card hydration from the same exact-edition cache;
- reviewed formula speech separated from displayed formulas;
- rights, formula, character-ceiling, checksum and timing gates fail closed.

## Deterministic inventory

| Measure | Result |
|---|---:|
| Tasks | 60 |
| Condition row references | 674 |
| Reviewed-solution row references | 1,938 |
| Unique row assets | 2,239 |
| Hebrew word references | 19,996 |
| Unique normalized word assets | 5,072 |
| Conservative provider-billed characters | 307,944 |
| Release ceiling | 320,000 |
| Formula rows resolved | 275 / 275 |
| System-compiled row references / owner overrides | 1,656 / 4 |

The owner attested the public TTS rights and approved the four exact Task 1
formula readings on 2026-09-01. The secret preflight validated a redacted ADC
service-account source before synthesis. No secret value is written to an
artifact or log.

## Task 1 real pilot

- Exact post-review billed characters: 2,278.
- Generated assets: 91 MP3 (`29 row + 62 word`).
- Timing sidecars: 29/29 complete (`got == n`), monotonic and hash-verified.
- Word lookup entries: 120 (`62` exact vocalized forms plus only unambiguous
  unvocalized aliases).
- Stored pilot payload: 1,454,784 audio bytes plus 9,056 timing bytes.
- Decode verification: 91/91 MP3 files; duration range 0.672–7.152 seconds;
  aggregate duration 181.848 seconds.
- Bake manifest SHA-256:
  `1441fc7ad5f8709f965cea825af049e0e67c788abcbea9661e3d0c7830748365`.
- Resumability check: the second bake completed from the existing 91-file cache
  in 328 ms without regenerating assets.

## Full-corpus bake

- All four preflight gates pass: rights, formula speech, cost and secret.
- Deterministic formula compiler coverage: 2,612/2,612 condition and solution
  rows, zero unresolved symbols; the four owner-approved Task 1 readings remain
  exact-row overrides.
- Generated assets: 7,311 MP3 (`2,239 row + 5,072 word`).
- Complete timing sidecars: 2,239/2,239.
- Public morphology index: 8,537 exact or unambiguous-unvocalized entries.
- Verified storage: 188,159,040 audio bytes plus 1,525,855 timing bytes
  (about 181 MiB total).
- Full decode verification: 7,311/7,311 MP3; duration range 0.672–43.2 seconds;
  aggregate duration 23,519.88 seconds (about 6 h 32 min).
- Bake manifest SHA-256:
  `13c58e03fb1b1e469d1105e616dcd3cb3037286bb6cb2930b82f4897716fbfa3`.
- Provider-zero repeat bake: zero provider calls, 1,473 ms, identical manifest.
- Production HEAD-only preflight: 7,311 checked, 0 already present, 0 request
  failures. No production writes and no full-TTS manifest deployment occurred.

## Production audio publication

- Owner action-time confirmation to use the existing Coolify
  `AUDIO_UPLOAD_TOKEN` was received on 2026-09-01.
- The secret was read from the running production container over the private
  SSH runbook path, held only in process memory and never printed or written.
- Resumable upload result: 7,310 newly uploaded, 1 prior smoke object found by
  HEAD, 0 failed; total 7,311/7,311.
- Independent keyless verification after upload: 7,311/7,311 MP3 present and
  every one of the 2,239 required timing endpoints present; 0 failures.
- Deterministic GET sample: first/middle/last row and word assets all matched
  the manifest byte length and SHA-256; all three row timing documents parsed
  with non-empty word timepoints.
- Full-TTS support manifest remained undeployed until these checks passed.

## Verification

- Focused Node suite: `82/82 PASS`.
- Full repository suite: `1246/1252 PASS`; the six failures are pre-existing,
  out-of-scope Classic/Import/Room-IA contract drift (`classicModeRedesign` 3,
  `remoteMediaAcquisition` 1, `roomLibrarySurfaceIa` 2). The TTS/version-lock
  failure found on the first run was corrected before this final run.
- `git diff --check`: pass.
- Local Chrome at 380 x 844: no horizontal overflow, no orphaned form inputs,
  document language/title/viewport present.
- Lighthouse snapshot: Accessibility 100, Best Practices 100, SEO 100,
  Agentic Browsing 100; 33 passed, 0 failed.
- New TTS controls are 48 x 48 px minimum on the gated full-TTS surface.
- Screenshot: `screenshots/room-library-380-gated.png`. The local publication
  catalog contains no Materials edition, so this is intentionally shell
  regression evidence, not a claim that gated audio is live.

### Full production release

- Commits `7259baae`, `fd621d05` and `32bb7cb1` are on `origin/main`.
  Coolify deployed the exact implementation revision `32bb7cb1` as application
  version `3.11.454`; the public shell-integrity map contains
  `/js/library-ui.js?v=454` and no stale `v=428` entry.
- The exact immutable edition is `ed_336ad34ad1d41dc58bc8124b`, edition 2,
  manifest `47c95fa3268afbebfc5f75078755813290b3e67e2148a56c78ea16e4169879c0`.
  Its 60/60 works expose `full_tts_generated=true` learning support.
- Representative tasks 1, 31 and 60 passed exact-edition support checks for
  condition, solution and formula rows. All sampled MP3 and timing endpoints
  returned public success responses.
- Reading Room Task 1 condition playback fetched row HEAD `200`, timing `200`
  and MP3 `206`. Its morphology card used the public word index (`200`) and
  content-addressed MP3 (`206`).
- The solution reader exposed row and continuous section controls. A displayed
  formula row played its separately reviewed spoken form via row HEAD `200`,
  timing `200` and MP3 `206`; a solution-word card used the same public word
  resolver and MP3 path.
- A real nested-dialog defect found during live QA was fixed red-first: an
  already-created shared morphology sheet is no longer made inert by the
  solution overlay. Production now reports `hidden=false`, `inert=false`, no
  `aria-hidden`, and focus inside the visible morphology dialog.
- In a fresh isolated Studio session, a canonical `#proTable` Hebrew cell was
  wrapped by `StudioMorph`, its morphology card opened accessibly, and
  «Произнести» fetched the shared Materials word index (`200`) and the exact
  same public content-addressed word MP3 (`206`). No user key or duplicate
  synthesis was used.
- Production mobile emulation at 380 px had document width 380 px, no page
  overflow and zero visible buttons below 44 x 44 px.
- Final focused release/a11y suite: `72/72 PASS`; `git diff --check`: pass.
- Machine-readable release record:
  `production-full-release-verification.json`.

### Production framework and isolated Task 1 pilot

- Commits `15d01d3b` and `6cf8f13e` are on `origin/main`; Coolify deployed the
  exact latter revision as application version `3.11.453`.
- The stale pre-cleanup deployment was cancelled, the duplicate manual rollout
  was removed, and the single exact webhook rollout completed successfully.
- Eight consecutive post-cleanup public probes returned `3.11.453`, `ok=true`,
  DB ready, `disk_pct_used=79`, `disk_warn=false`.
- The public edition remains intentionally honest: Task 1 reports
  `full_tts_generated=false`, and its word-audio index returns `404`. No partial
  pilot asset was published.
- `materials-pb2-tts-pilot-browser-smoke.js` exercised the real production
  `3.11.453` shell with the verified Task 1 MP3/timing cache injected only into
  an isolated browser route. It proved 2 condition row buttons, 31 solution row
  buttons, two section-play controls, a complete timing fetch, and morphology
  word playback through the one shared public word resolver.
- Mobile 380 x 844: no document/viewer overflow, zero controls below 44 px, all
  33 row-audio buttons present. Page errors: zero.
- Reproducible report and screenshots:
  `production-pilot/task-001-production-shell-browser-verification.json` and
  `production-pilot/screenshots/`.

## Docker cleanup for deploy capacity

Local Docker context: `desktop-linux`.

- Before: 81 images, 121.4 GB total; build cache 838.4 MB.
- Action: unused images and builder cache only; no containers or volumes.
- Docker-reported reclamation: 33.95 GB images plus 700.3 MB build cache.
- After: 8 images, all referenced by containers; build cache 138.1 MB with no
  reclaimable entries.
- `hermes-webui` remained healthy and `hermes-agent` remained running.

Removed image layers are recoverable only by pulling or rebuilding them.

### Production host

- Before: root filesystem 38 GB used of 38 GB (`100%`, 0 available); 16 images,
  9 active; build cache 6.275 GB.
- Action: `docker image prune -a -f` and `docker builder prune -f` only. No
  container, volume or application-data deletion.
- Reclaimed: 935.5 MB image layers plus 5.132 GB build cache.
- After: root filesystem 79% used with 7.9 GB available; 9 images, all active;
  build cache 1.143 GB. The same 9 container IDs remained running.
- Three independent public `/healthz` probes returned `ok=true`, DB and
  migrations ready, `disk_pct_used=79`, `disk_warn=false`.
- The `3.11.453` build temporarily raised disk use to 87%. A post-deploy prune
  removed 2.121 GB of unused builder cache (13.24 kB unused image data), restored
  7.9 GB available / 79% used, and retained the same nine running services on
  their required active images.
- After the final `3.11.454` rollout, an explicit inventory proved that the sole
  app container used image `32bb7cb1`; all nine containers and their nine active
  images were identified before cleanup. `docker image prune -a -f` removed only
  the two unused older app images (`fd621d05`, `5501b202`) and reclaimed 353 MB.
  `docker builder prune -a -f` removed only unused build cache and reclaimed
  3.59 GB. No container or volume was removed.
- The root filesystem improved from 89% used / 4.1 GB available to 77% used /
  8.5 GB available. Docker then reported 9 images, all 9 active, and zero build
  cache. The same 9 container IDs remained running.
- Eight consecutive public probes after cleanup returned `ok=true`, version
  `3.11.454`, DB ready, migrations ready, `disk_pct_used=77` and
  `disk_warn=false`, with uninterrupted uptime increasing from 451 to 467 s.

Unused production image/cache layers can be restored only by pulling or
rebuilding them. The media-acquisition and main LinguistPro containers were both
running healthy after the final cleanup.

## Formula speech policy

`materials-formula-speech-he-v1` preserves Hebrew prose and deterministically
voices embedded variables, operators, ranges, fractions, powers, units,
materials and chemistry notation. Unknown semantic tokens stop the release
before output or provider access. `FORMULA_REVIEW_GUIDE.md` documents the full
source-bound audit and the optional exact-row override workflow.

## Release gates

1. Rights gate: `PASS`, recorded in `full-tts-rights-attestation.owner.json`.
2. Secret gate: `PASS`, ADC service-account material validated and redacted.
3. Task 1 formula gate: `PASS`; the four accepted readings are recorded in the
   canonical formula ledger.
4. Whole-corpus formula gate: `PASS`, 275/275 formula-marked rows and all 2,612
   row references compile without unresolved tokens.
5. Full bake and exact-edition support rebuild: `PASS` locally.
6. Production upload: `PASS`, all 7,311 assets and 2,239 timing sidecars are
   publicly present; deterministic GET/hash sample is `PASS`.
7. Scoped implementation push and exact-version deployment: `PASS`.
8. Live Reading Room condition/solution/formula/morphology QA: `PASS`.
9. Live Studio shared-public-word-audio QA: `PASS`.
10. Nested-dialog accessibility and 380 px mobile QA: `PASS`.
11. Post-deploy unused-image/build-cache cleanup and health streak: `PASS`.

The remaining boundary is owner acceptance on the owner's ordinary desktop and
mobile sessions; it is intentionally not inferred from automated or operator QA.
