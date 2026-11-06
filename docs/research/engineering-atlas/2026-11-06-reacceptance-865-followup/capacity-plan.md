# O-153: read-only capacity plan

Measured 2026-11-06, before any follow-up release. No cleanup, image removal, volume removal, provider change or filesystem change was executed.

Root `/dev/sda1` is ext4. Available: **2,677,555,200 bytes (2.493 GiB)**. The runtime-push gate is **6,442,450,944 bytes (6 GiB)**; deficit **3,764,895,744 bytes (3.507 GiB)**. Reserved root blocks are not counted as release capacity. The 40,961,572,864-byte disk is already almost entirely partitioned; resizing the existing filesystem alone cannot supply this deficit. `growpart` and `resize2fs` are installed.

## Preserve

| Object | Image ID | Retention |
|---|---|---|
| Current 865 / commit 82328f3327a0fd80be539b8efd03969170d96ad6 | `sha256:a4c5bdb4d212dc0aef21666ac197db78acc81ddbff5169a9b829f71085c2d717` | Running container; keep |
| Previous rollback 864 / commit 753f5bef652a52057df43cccc919904fe0acee25 | `sha256:184d42c6bc05028283406869bd318f4117ca9f5e5d30e5f8458d3d9757daa14b` | No container, deliberately pinned rollback; keep |

All nine running containers, all four active volumes, atlas backups, reader data and other services stay intact. Broad image/system/volume prune is unsuitable: Docker labels the deliberately retained rollback image unused.

## Objects eligible for a separately authorized cleanup

The old **863** image, repository tag `glmw0wjd6nm70fntxgjy6fkp:19d99822f49d58ceb72469469fee7bf6801d974f`, has ID `sha256:66c763ddbde3580f0fb03c976751cb5c482a5699a36bc7fb2150523802d676eb`. Read-only image inspection and the complete container list confirm no container uses it. Docker estimates **1.589 GB unique**; removal would lose the additional 863 rollback, while 865 and 864 remain. No removal is authorized or performed.

The following 16 build-cache records were reclaimable at inspection:

```
j41oia6znlqzvsjrkdvpuxbhv
o1dgvtbrbq4xlez8segkknr81
iswgcbhfm2xzuwn797ujisrzc
fgh345afmul1r9h0yw2v8hjlm
n5ww5z2ef4fyjghmx9x1orvus
96qmgunkqwm3bs8vj6gtqs2zu
u6ke7buv1nc3lgabos7djwd47
buzmllkf7ynad9wxmf0s0020r
v0ejmw0rr5jvxne19ix01ijo6
3xifk76otrop3wt35gvqw0hel
mina2wco3sak5asmjxioljwhy
flwse6z50dk6vuexkefnfw8w3
ivzme39d28hdpt2ocpo07xxdo
i469v1kjajg0etyj4q2hlabkz
3i79qktqdi4ybybodn1kuwq4y
xciwuzelpdo5omn6a7zv5brxa
```

Logical cache size is **3.142 GB**, including **1.654 GB shared** with retained images. Physical private reclaimable size is approximately **1.488 GB**. Shared image layers remain required after cache metadata removal; these figures must not be added twice. Removing these cache records would slow the next build and discard reusable build work, without removing runtime images or user data. Reinspect exact records and active builds immediately before any approved operation; a record that became active must be excluded.

**Cache plus old 863 is insufficient:** estimated available space afterwards is 2.678 + 1.488 + 1.589 = **5.755 GB, about 5.36 GiB**, still around **0.64 GiB below the gate**. These are rounded estimates, not guaranteed freed bytes.

Unused `coollabsio/coolify-helper:1.0.19`, image `sha256:b0cf60e6d6ecc73696811fe105d7b187b0fa387bd8ec62c647177420daf42bad`, has **689.2 MB unique**. Including it would only barely reach the gate by rounded estimates; Coolify may need to pull it again for the very next deployment. Therefore it is not proposed as reliable deployment capacity. No sufficient safe cleanup set has been established while preserving current, previous rollback and deployment prerequisites.

## Expanded inventory before considering a paid change

All sizes below are read-only measurements. File dates are UTC modification times, not proof of a successful restore. No archive contents, database rows or security-log contents were opened. Regular backup files have one hardlink and allocated blocks close to their file lengths; they are not Docker shared layers.

| Exact backup path under `/opt/backups/linguistpro/` | Bytes | Modified UTC | Role / loss if removed |
|---|---:|---|---|
| `app-data-20261101-030001.tar.gz` | 1,533,335,885 | Nov 1 03:07 | Daily volume snapshot, including consistent SQLite snapshot; loses this precise restore point |
| `app-data-20261102-030001.tar.gz` | 1,742,830,949 | Nov 2 03:08 | Daily restore point; same restriction |
| `app-data-20261103-030001.tar.gz` | 1,747,406,920 | Nov 3 03:08 | Daily restore point; same restriction |
| `app-data-20261104-030001.tar.gz` | 1,753,442,392 | Nov 4 03:08 | Daily restore point; same restriction |
| `app-data-20261105-030001.tar.gz` | 1,753,390,964 | Nov 5 03:08 | Daily restore point; same restriction |
| `app-data-20261106-030001.tar.gz` | 1,830,307,122 | Nov 6 03:08 | Latest daily backup; preserve |
| `app-data-full-20261101-043002.tar.gz` | 2,331,056,821 | Nov 1 04:37 | Full volume backup, including nested backup directory; preserve |
| `milestones/app-data-20260826-014914.tar.gz` | 1,056,635,541 | Aug 26 01:51 | Milestone restore point; age alone does not authorize deletion |

Total allocated `/opt/backups`: **13,748,482,048 B**. The tracked `scripts/ops/backup-linguistpro-online.sh` explains daily/full roles, online SQLite snapshot/integrity and archive checks. Its defaults retain daily 14 days and full 28 days; actual server override values were not inspected. No external copy or successful independent restore of these exact archives was established here. Later snapshots cannot reconstruct an earlier exact user/database state. Therefore **none is classified safe to delete**.

An additional **318,642,644 B** file exists at `/var/lib/docker/volumes/glmw0wjd6nm70fntxgjy6fkp-linguistpro-data/_data/backups/mediatheque-20261101-pre.db.gz` (Nov 1 18:26). Its name indicates a pre-change database recovery point; contents and external copy are unverified, so preserve. Atlas rollback backups occupy only **2,347,008 B**, and 97002-related backup directories roughly 17 MB: preserve; their removal is immaterial to the deficit. The live app volume totals **6,769,467,392 B** and contains published corpora, audio and user databases. Cache-like names inside that volume do not establish disposability: no audio, model cache, imports, corpus or user-data deletion is proposed.

| Other precise object / operation requiring separate authorization | Maximum estimated physical gain | Risk / recovery / deployment effect |
|---|---:|---|
| `/tmp/atlas97001-865-upload/release-data-865.tgz` and `/tmp/atlas97001-reacceptance-82328f33-b/release-data-865.tgz`, both Nov 6 11:14 | 2,432,692 B total | Both SHA-256 `713eda9aafec247319a5bd6c3f8793060e0f26701b6208628bf97262c9bb8f81`, equal to retained local release archive. Re-uploadable; deleting only staged copies does not remove deployed data or rollback backup. No deletion performed. |
| One of `/tmp/atlas97001-before-20261106-sourceaudit.tgz` (08:51) and `/tmp/production-before.tgz` (08:55) | 1,139,333 B | Proven duplicate SHA-256 `44c047dfe30cb7dab578b603882dc915a54912b6c7088c271fcfe775d3db6d5a`; preserve the other. Historical point is not reconstructable from current data. |
| Other `/tmp` release artifacts | Entire `/tmp` is only 11,165,696 B | Their names/dates are in raw inventory; unknown-purpose files and active systemd directories excluded. Even deleting all would not materially resolve the gate. |
| `/home/peter/a97001-runtime-v1.tar.gz`, Nov 6 01:13 | 75,728,918 B | Old downloaded runtime package; exact external duplicate/rebuild equivalence not established. Preserve until its role/copy is verified. |
| `/var/cache/apt/srcpkgcache.bin` and `/var/cache/apt/pkgcache.bin`, Nov 6 08:22 | 117,341,989 B | Generated package metadata, regenerable from package lists. No runtime/rollback dependency. Removing these exact files would slow next package query; no action performed. |
| `/var/lib/apt/lists/` package repository indexes | Directory allocated 207,052,800 B | Regenerable with successful repository refresh; affects offline package-management capability. Exact current file allowlist retained in metadata inventory. Directory locks/partial state are not cleanup targets. |
| Journal archived segments, `/var/log/journal/` | Total directory 327,557,120 B; journal tool reports 304.3 M | A separately approved bounded journal retention operation can remove only archived segments; actual gain depends on active segments. Loses diagnostic/audit history, not reconstructable without external logging. No vacuum or rotation performed. |
| `/var/log/btmp.1`, Oct 31 23:59 | 172,969,472 B | Rotated failed-login audit history. File can be removed only if owner accepts audit-history loss or verifies an external copy. Do not treat as a disposable cache. |
| `/var/log/auth.log.1`, Oct 31 23:59; `/var/log/syslog.1`, Nov 1 00:00 | 29,731,268 + 10,607,346 B | Rotated authentication/system history; same preservation requirement. Active auth.log/btmp must not be truncated. Compression gain is unknown and compression itself is a write, not attempted. |

The small **proven regenerable/duplicate set** (APT binary metadata plus ~3.6 MB staged duplicates) adds only ~121 MB to cache+863. It still leaves about **0.53 GiB deficit**. Including all APT list indexes still remains below the gate. Reaching the gate through logs would require irreversible loss of security/diagnostic history and leave a small, uncertain margin: this is not a reliable no-backup-loss deployment plan. Do not sum directory totals with their listed member files.

**A non-billable conditional route exists**, but needs a deliberate backup retention decision: after independently verifying an external copy and restore capability for the exact Nov 1 daily archive, remove only its local `/opt/backups/linguistpro/app-data-20261101-030001.tar.gz`, plus the exact obsolete 863 image and the inspected inactive build cache. Estimated available: **7.288 GB ≈ 6.79 GiB**. This preserves current865, previous864, latest daily, full backup, milestone and all live data; it removes one local historical recovery point and increases cold-build work. Without verified external retention, it would permanently lose that point, so it is **not yet a safe recommended action or permission request**. A larger margin could be obtained by externally retaining another exact daily archive, but no archive transfer or deletion is authorized or attempted. Backup handling would require a separately approved secure destination; do not copy private data into public artifacts or Library.

Mounted filesystems: root ext4 is the only general-purpose persistent disk. `/boot/efi` has 264,132,096 B free but is a 264 MB EFI filesystem, unsuitable for build/cache. `/dev/shm` has 2,002,714,624 B nominal free, while system available RAM is about 2,093,830,144 B and swap is zero; moving build/cache there risks OOM and cannot satisfy the disk gate. `/run` and per-user tmpfs are ~400 MB each, share the same RAM and cannot be added as independent storage. Docker overlay mounts use the same root backing filesystem. No already attached persistent volume with sufficient free capacity was found. A builder/cache migration to another existing filesystem is therefore not available from this inventory; no mount, Docker config or data migration was changed.

Decision order: verify whether an owner-approved external copy of one exact historical backup already exists; if so, design its verification/retention action before requesting removal. Otherwise, the paid no-delete route below remains an option. Neither route has been executed.

## Route without deletion

Increase the provider root disk by at least **5 GiB effective capacity** (the next supported larger disk plan is preferable), then extend partition 1 and its ext4 filesystem. At unchanged usage this would raise available capacity to about **7.49 GiB**, providing a useful margin above 6 GiB. Hetzner ties the primary disk to the server plan, so the exact available plan and price must be checked in the owner's provider account. No provider credentials, billable change, shutdown, restart or filesystem growth has been attempted.

Concrete approval scope to resolve once the provider plan is selected: rescale this existing server with the larger root disk, accept the displayed recurring price and a maintenance outage, preserve all disks/data/images/volumes, then extend `/dev/sda1` and ext4 (tools available: `growpart /dev/sda 1`, `resize2fs /dev/sda1`, only after verified larger device geometry). Primary-disk expansion cannot later be shrunk by Hetzner. A fresh capacity/retention/service-health check must show **at least 6 GiB available** before runtime push. If safe partition growth requires provider Rescue, use the documented maintenance procedure; do not improvise partition deletion/recreation under the current no-delete instruction.

This is a reviewable proposal, not authorization. Exact plan/cost and the maintenance window remain undecided; no generic permission to clean or delete is requested. A new attached disk with Docker migration is another possible no-data-deletion architecture, but its mount/migration/outage plan has not been validated and is not ready for approval.

Sources: [Docker shared-cache accounting](https://docs.docker.com/reference/cli/docker/buildx/du/), [Hetzner primary-disk rescale and downgrade limits](https://docs.hetzner.com/cloud/servers/faq/). Local raw inventories are retained in the accompanying candidate evidence archive, not published with private server credentials.

## Remaining final checks, separate from capacity

At the time of this inventory: final whole npm and Python suites, actual-browser column/97002 rerun, final 203-page layout review, frozen candidate commit and export, remote CI, and final artifact packaging were not complete. The 139-test targeted suite, six focused term/training tests, synthetic UI flow and 42-section/2,905-row legacy prepared-content check had passed. Their final results are recorded separately as they finish. Publication and live 866 verification depend on the capacity gate; they have not occurred.
