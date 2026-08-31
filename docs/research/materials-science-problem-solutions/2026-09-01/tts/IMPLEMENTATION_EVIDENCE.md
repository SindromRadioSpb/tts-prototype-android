# Materials PB2 public TTS — implementation evidence

Date: 2026-09-01
Status: `FRAMEWORK_PROD_VERIFIED · TASK1_PILOT_GENERATED_AND_VERIFIED · FULL_GENERATION_GATED · PUBLICATION_NOT_STARTED`

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
| Unique row assets | 2,251 |
| Hebrew word references | 19,996 |
| Unique normalized word assets | 5,072 |
| Conservative provider-billed characters | 270,680 |
| Release ceiling | 320,000 |
| Formula rows approved / awaiting separate speech review | 4 / 271 |

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

The whole-corpus preflight still fails closed before output creation at the
first remaining unreviewed formula row:
`materials-science-y1-pb2-exercise-p005-allotropy-sol-r023`.

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

Unused production image/cache layers can be restored only by pulling or
rebuilding them. The media-acquisition and main LinguistPro containers were both
running healthy after the final cleanup.

## Remaining formula review compression

`formula-speech-unique-review-pack.json` groups only byte-equivalent normalized
display formulas. It reduces 271 pending rows to 222 exact-form decisions while
retaining every occurrence for contextual review. `FORMULA_REVIEW_GUIDE.md`
defines the no-overwrite apply command and the full no-synthesis preflight.

## Open release gates

1. Rights gate: `PASS`, recorded in `full-tts-rights-attestation.owner.json`.
2. Secret gate: `PASS`, ADC service-account material validated and redacted.
3. Task 1 formula gate: `PASS`; the four accepted readings are recorded in the
   canonical formula ledger.
4. Whole-corpus formula gate: `BLOCKED`, 271 rows remain owner/reviewer-pending.
5. Only after the remaining formula gate passes may the full bake, upload,
   exact-edition support rebuild and production verification run.
