# Production incident — service-worker install failing closed + disk exhaustion

Date: 2026-09-02
Runtime at incident: `3.11.457`
Status: SW defect FIXED in `0788dd4d` (deploy was blocked by disk, then unblocked)
Related: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md` (wave T1),
`project_prod_disk_full_deploy_block` (2026-08-05, the same disk failure mode)

## 1. What happened

Two independent problems compounded during the T1 release.

### 1.1 The service worker stopped installing (self-inflicted, fixed)

`public/sw.js` verifies, at install time, that every URL in the server's
`SHELL_INTEGRITY_PATHS` is present in its own precache with matching bytes, and it **fails
closed**:

```js
const hit = await cache.match(url);
if (!hit || !/^[a-f0-9]{64}$/.test(String(expected))) throw new Error("shell integrity manifest invalid");
```

`cache.match()` compares the **full URL including the query string**. Commit `e1aad546` bumped
the precache to `/js/library-ui.js?v=457` and the locales to `?v=191` while `server.js` still
listed `?v=456` and `?v=190`. Those entries could never be found, so every install threw and no
new service worker activated.

**User impact.** `staleWhileRevalidate` refreshes only the *runtime* cache — a precached entry is
never rewritten outside install (`if (!alreadyPrecached) runtime.put(...)`). So a returning user
kept being served the old precached `/library.html`, which requests `library-ui.js?v=456`, which
was also in the old precache. Existing users received **none** of wave T1 until a successful
install. First-time visitors (no service worker) were unaffected.

Fixed in `0788dd4d`: `SHELL_INTEGRITY_PATHS` realigned to `?v=457` / `?v=191`, with
`train-queue.js` added to the cohort.

### 1.2 Root cause: six version stamps, three of them ungated

A release must move **six** stamps, and the T1 plan knew of three:

| # | Stamp | Location |
|---|---|---|
| 1 | `window.APP_VERSION` | `public/index.html` |
| 2 | `CACHE_VERSION` | `public/sw.js` |
| 3 | locale `?v=` | `public/index.html` **and** `public/library.html` |
| 4 | Room shell version | `public/library.html` `#roomFooterVersion` |
| 5 | per-module `?v=` | `public/library.html` **and** the `sw.js` precache |
| 6 | shell-integrity cohort | `server.js` `SHELL_INTEGRITY_PATHS` |

Stamp 4 drifting produced an "update available" toast on every load, which (see §3) covered the
bottom sheet and broke two browser gates. Stamps 5 and 6 drifting produced §1.1.

**Now gated instead of remembered:**

- `smoke:train-queue` asserts `SHELL_INTEGRITY_PATHS` ⊆ `PRECACHE_URLS`, that the shell and the
  precache agree on the `library-ui.js` / `train-queue.js` cache-busts, and that the
  `library-ui.js` `?v=` tracks `CACHE_VERSION`.
- `tests/i18n.smoke.js` Suite 10 finally does what its title always claimed — compares the
  shells' locale `?v=` against the `sw.js` precache.

Both were verified to fail against the exact state that shipped.

### 1.3 Disk exhaustion blocked the fix

The hotfix could not deploy: the root filesystem reached 100%. Its image
(`glmw…:0788dd4d`) existed at **403 MB against a normal 1.25 GB** — the build had started and
died mid-layer.

Disk went 88% → 94% → 98% → 100% within one hour, because three deploys in quick succession each
added a ~1.25 GB image plus build cache.

## 2. Disk: measured, not assumed

| Consumer | Size | Finding |
|---|---|---|
| `/opt/backups/linguistpro` | 15.6 GB | **Retention is NOT broken** — 11 daily archives, all inside the documented 14-day window |
| `/opt/backups/linguistpro/milestones` | 3.4 GB | 4 ad-hoc snapshots, 2026-08-20 … 2026-08-26 |
| Docker build cache | 6.55 GB | 0 active, fully reclaimable |
| Unused app images | ~5 GB tagged | previous Coolify builds |
| journald | 819 MB | |
| apt cache | 109 MB | |

The important correction: the earlier assumption that backup rotation had failed is **wrong**.
The 14-day policy works exactly as `CLAUDE.md` documents. The problem is *sizing* — a single
backup grew from 1.056 GB (2026-08-26) to 1.243 GB (2026-09-02), so 14 days of them claim
~17 GB of a 38 GB disk and the share keeps rising.

### Freed this session (owner-authorised)

| Action | Freed |
|---|---|
| 4 unused app images (kept `56824f45` as a rollback target) | 1.1 GB |
| `docker builder prune -af` (0 active) | ~5.4 GB |
| `journalctl --vacuum-size=200M` | 640 MB |
| `apt-get clean` | 109 MB |
| **Result** | **100% → 80%, 7.2 GB free** |

Not touched: the three Docker volumes (2.7 GB — user data), the 11 daily backups, and the 4
`milestones` snapshots.

## 3. Known, deliberately not fixed here

**The update toast can cover the bottom sheet.** `.room-update-toast` is `z-index: 1300` at
`bottom: 64px`; `.room-study` is `z-index: 990`. When a genuine update lands, the toast floats
over the study sheet's primary controls — it broke `smoke:reader-morph` and
`smoke:studio-room-srs` during this release. It predates wave T1 and equally affects the existing
answer controls. The sheet's `990` is deliberately below `.rm-sheet(1000)` so a row's expand-card
stacks above the list, so restacking needs its own consumers sweep rather than a drive-by bump.

**`smoke:room-study` fails** — verified against the session-start tree with none of this wave's
changes applied. Pre-existing.

## 4. Open items for the owner

1. **Backup sizing is the standing risk.** 14 days × ~1.25 GB and growing, on a 38 GB disk, with
   Docker needing several GB of headroom per deploy. Options: shorten retention, move backups off
   the box, or grow the volume. Deleting backups is not a fix — the next fortnight refills them.
2. **The 4 `milestones` snapshots (3.4 GB)** are the only backup content older than 7 days. Held
   pending an explicit decision; the directory name signals deliberate retention.
3. **Deploy cadence.** Three releases in an hour is what exhausted the disk. A prune step in the
   deploy path, or fewer intermediate releases, would prevent a repeat.
