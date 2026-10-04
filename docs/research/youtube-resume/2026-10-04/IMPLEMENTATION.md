# YouTube resume fix and production disk recovery

Date: 2026-10-04 UTC. Released code: `3a4a6861`, version **3.11.729**. Fix: `54ae3733`. Evidence: isolated desktop Chromium and production GET/browser probes; no owner-profile or physical-device acceptance claimed.

## Result

Studio Classic and Room cue the existing YouTube video at the saved row timestamp using `cueVideoById`, without autoplay or waiting for media buffering during page opening. The karaoke follower ignores the initial stale zero clock and a preceding keyframe until the restored timestamp is reached. Existing media lifecycle identity guards retain ownership across fast switching. Blind/unmapped rows are not assigned a guessed time. Rebinding a rendered table does not rewind an already used player. Restore itself does not write progress.

Room starts its existing background media setup after its working row is established. Studio supports both readiness orders: resume before player creation and resume after player readiness. Script query keys, SW precache/integrity keys and shell version advance together.

## Verification

- Focused unit/contract suite: **47/47 PASS** (karaoke, YouTube adapter, material lifecycle, shell integrity parity).
- Local Room media gate: **PASS**; local opening lifecycle gate: **PASS**.
- GitHub CI **37228013402: success**, including the full unit suite, API/migration smoke and material identity/resume/independent-tab gates.
- Production convergence: **3 rounds PASS**, version 3.11.729, health/DB/migrations ready, **29 served public assets** match the committed bytes. See [served-assets.json](production/served-assets.json).
- Deterministic production browser gate: **PASS** for Classic open/reload/new tab, IDE, rapid Studio A→B, Room open/reload/switch/rerender. All fixtures were in disposable OPFS; production-origin mutations were blocked.
- **Real YouTube production gate: PASS** for Classic open/reload/new tab, rapid A→B, Room open/reload/switch/rerender. Actual iframe `PngchpnAS5E`, trusted native Play; observed player clock reached the saved 48.25/96.25-second targets and progress stayed near those rows, without returning to row 0. No page errors; review_log unchanged. Real native iframe interaction in IDE was not included because that iframe is hidden by the existing IDE layout; IDE integration was checked deterministically.

Reproduce the real gate with `YT_RESUME_BASE=https://linguistpro.kolosei.com`, `YT_RESUME_VERSION=3.11.729`, `YT_RESUME_REAL=1`, then `node scripts/premium/youtube-resume-smoke.cjs`. The remote gate performs fixture writes only inside its own disposable browser.

## Authorized disk recovery

Before recovery, host root had **0 free bytes, 100% used**. Coolify PostgreSQL logged ENOSPC, and the built 3.11.729 image had not replaced 3.11.728. This was a rollout blocker, not a completed deployment.

Owner explicitly authorized build-cache cleanup, then the exact old unreferenced `e878b850` app image and compression of the Coolify journal. Actions:

1. `docker builder prune -af` removed only unused BuildKit cache (Docker reported 4.11 GB; host initially gained about 2 GiB).
2. Rechecked container references, then removed only image `sha256:a85edd769d714fbb854cf41454768fdd9f91d119170f9c652acd07c688de6da3` (`e878b850`). Active `01b1c000`, retained previous `40d9f134`, and release `3a4a6861` images were preserved.
3. Rotated `laravel.log` in Coolify, gracefully recycled Horizon workers, and verified no process held the rotated file open. Compressed the 2.1 GiB journal to **59.3 MiB**, checked gzip integrity and exact decompressed SHA256 `af46c7321543c62b47796ddabc637e0bf5f50db568b54f6ccec5d3fbf134ccc7` before removing the verified plaintext copy. The full history remains in `laravel-2026-10-04-before-disk-recovery.log.gz`.
4. Retried the interrupted deployment using Coolify's queue helper. Fresh deployment **2636 finished** and standard rollout replaced the old app container and cleaned its own temporary builder. No broad Docker prune or manual container/volume removal was used.

Final host state: **5.2 GiB free (about 5.6 decimal GB), 86% used**. All **4 volumes** preserved; Coolify/PostgreSQL healthy; LinguistPro version 3.11.729 and DB/migrations ready. `disk_warn` remains true at 86%; this report does not claim the capacity warning cleared. See [health-after-cleanup.json](production/health-after-cleanup.json).

The deployment authorization and the requirement to check production free space before release were saved in the user's requested long-term memory update note.
