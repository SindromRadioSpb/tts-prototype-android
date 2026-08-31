# Materials PB2 public TTS — implementation evidence

Date: 2026-09-01
Status: `LOCAL_IMPLEMENTATION_COMPLETE · GENERATION_NOT_STARTED · PUBLICATION_NOT_STARTED`

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
| Formula rows awaiting separate speech review | 275 |

No provider request was made. A real bake was deliberately attempted only as
far as the preflight and stopped with `FULL_TTS_RIGHTS_BLOCKED`. Task 1 formula
validation stopped independently at its first unreviewed formula row.

## Verification

- Focused Node suite: `77/77 PASS`.
- Full repository suite: `1241/1247 PASS`; the six failures are pre-existing,
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

## Docker cleanup for deploy capacity

Local Docker context: `desktop-linux`.

- Before: 81 images, 121.4 GB total; build cache 838.4 MB.
- Action: unused images and builder cache only; no containers or volumes.
- Docker-reported reclamation: 33.95 GB images plus 700.3 MB build cache.
- After: 8 images, all referenced by containers; build cache 138.1 MB with no
  reclaimable entries.
- `hermes-webui` remained healthy and `hermes-agent` remained running.

Removed image layers are recoverable only by pulling or rebuilding them.

## Open release gates

1. Owner must complete `full-tts-rights-attestation.template.json` with an
   explicit legal basis, timestamp and public TTS scope.
2. Owner/reviewer must approve the exact spoken Hebrew for all 275 formula rows.
   The four Task 1 candidates are listed in
   `task-001-formula-speech-pilot-review.md`; they are suggestions, not accepted
   truth.
3. Only after both gates pass may the bake call Google, upload MP3/timing assets,
   rebuild exact-edition support and proceed to production verification.
