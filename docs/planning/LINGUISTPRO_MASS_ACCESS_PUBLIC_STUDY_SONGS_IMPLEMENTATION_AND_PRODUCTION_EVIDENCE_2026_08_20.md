# LinguistPro Mass Access — Public Study Songs: implementation and production evidence

**Date:** 2026-08-20

**Program:** `MASS-ACCESS-PUBLIC-STUDY-SONGS`

**Status:** `PRODUCTION`

**Slices:** `I1 -> I2 -> I4`, with serial gates

**Public URL:** <https://linguistpro.kolosei.com/library.html?public_corpus=study-songs>

**Application version:** `3.11.417`

**Production code commit:** `67afe3fdf254de29b5a1ab3aa5df0ef04609d2d6`

## 1. Owner decisions and scope

The shipped implementation preserves the approved decisions:

- `D1=DEDICATED_PUBLICATION_DOMAIN_IMMUTABLE_EDITIONS`;
- `D2=ONE_WRITER_STUDIO_PRIMARY_ROOM_DEEP_LINK`;
- `D3=STUDY_SONGS_FIRST`;
- `D4=GUEST_FIRST_CONTEXTUAL_OPTIONAL_ACCOUNT`;
- `D5=UNIFIED_SEND_OR_SAVE_SOURCE_SPECIFIC_PAYLOAD`;
- `D6=MENTOR_INLINE_ACCOUNT_SYNC_TELEGRAM_JOURNEY`;
- source operation is copy, never move or delete;
- no automatic ASR, translation, timing or TTS is triggered by publication;
- `B9=FROZEN`; no Paths, Assignments or AI curator were added.

Rights authority for the publication snapshot is the owner's declaration
`OWNER_ATTESTATION_2026_08_20`. It is represented as per-item facts, not as a
corpus-level copyright/takedown flag. The RU/EN/HE public and publisher surfaces
retain the educational-project context and `peter@kolosei.com` takedown address.

## 2. Delivered product

### I1 — publication domain

- Migration `063_publication_domain` creates a dedicated `published_corpora`
  aggregate, drafts, immutable editions, edition items, content-addressed assets,
  per-item rights, stable current-edition pointer, publishers, idempotency records
  and append-only events.
- `db/publicationRepo.js` is the only owner of canonical publication writes.
- Anonymous and owner/publisher APIs use separate namespaces and middleware.
- Publish validates the draft, stages immutable files, computes hashes and ZIP,
  reads the edition back, and only then atomically switches the public pointer.
- Canonical commit is separate from optional cache warming.
- Fault injection tests prove rollback both before and after pointer switching.
- Existing group corpus tables remain group-restricted and are never relaxed to
  implement public access.

### I2 — Publication Center

- Studio contains the owner/publisher-only Publication Center and is the primary
  writer.
- It can create future public corpora, copy from My Texts or a group corpus,
  reorder/preview/validate, apply the Study Songs owner-attestation preset to
  selected new items, publish a new edition, and withdraw/restore through events
  and pointer state.
- Published editions are not edited in place; the next change starts a revision
  draft.
- Reading Room management links to the same Studio writer; it does not introduce
  a second mutation path.
- RU/EN/HE, RTL, responsive and keyboard/accessibility contracts are covered by
  tests and browser smoke.

### I4 — anonymous Reading Room adapter

- The dedicated anonymous API serves catalog, immutable work snapshots, original
  audio and the permitted ZIP without group membership or an account.
- Public `GET` routes do not call audit, session, CSRF or learner-state writers.
- Stable corpus/work links survive reload and expose no private/group identifiers.
- Account language is contextual and optional: it is offered only for sync and
  durable personalization.
- The shared Send or save flow supplies the stable link and the real ZIP payload.
- The service worker caches immutable public material and correctly synthesizes
  byte-range `206` responses online and offline.

## 3. Production migration and rollback evidence

### Backup

A new backup was created before the production migration:

- archive: `/opt/backups/linguistpro/app-data-20260820-172727.tar.gz`;
- archive size: `746702786` bytes;
- archive SHA-256: `d94941086382946a15a599063248b9eb79f147ba976dc21cbde7c5b3224752d7`;
- `gzip -t`: `PASS` after deployment;
- SQLite snapshot size: `466255872` bytes;
- SQLite snapshot SHA-256:
  `e3975732da9f761169580e5c1fee4902e67f90240133cde0e06c5229c1352507`.

### Temporary production-like rehearsal

Migration `063` was rehearsed on a fresh copy of the pre-migration production
database:

| Check | Result |
|---|---:|
| `PRAGMA integrity_check` before/after | `ok` / `ok` |
| publication tables after `up` | 11 |
| publication tables after `down` | 0 |
| publication tables after reapply | 11 |
| latest production migration | `063_publication_domain` |
| applied production migrations | 63 |

The rehearsal proved that the migration does not alter group, private, learner or
review tables. Their pre-migration fingerprints were:

| Truth domain | Rows | SHA-256 |
|---|---:|---|
| `review_log` | 7420 | `52a7253100ac44ea70378162103583cd9bb6af9d5531f9183be17e4c841add63` |
| `learner_events` | 80 | `507efd5efee09e24e7e10eb69e400d5bef886f3d24160f09638818183ae2d985` |
| `learner_artifacts` | 117 | `34abc3b03a3ead3cbf934d3c1930c84548776532a1065afb999811ba655606ee` |
| `learner_artifact_meta` | 116 | `6d0cb8b71c99deffde658d0a1a11b52144c3573b9226f34c0d8647a22601e4eb` |
| `group_corpora` | 1 | `a1bec58cea2e583c5b7caef71607aea07b235be3d49f1692aa7d6cc5da6512cd` |
| `group_corpus_works` | 77 | `2acc10796579990d52aed0a64ff7a59fa007f6773573e92f1355e8310303d45d` |
| `group_corpus_audio` | 2160 | `a641c394cb754fadcf441b9cde41f8c9285a64ec9e34e945e71e9ec9e5e2eadd` |
| `reading_groups` | 1 | `ebc287b60519491f230f5503b6ad275aec46ee13dd7a4ba52e69d2ce681e84de` |
| `reading_group_members` | 2 | `543790eeb0a7a840dfef6b20526b738c3529d81fbcc20da2d20fe351357ff9b0` |

The post-publication production row counts are identical. The controlled
publication runner additionally recomputed source bundle/audio hashes before and
after each run and returned both `source_unchanged=true` and
`learner_private_review_unchanged=true`.

### Rollback posture

- Previous application images for `4eafa64d`, `0eda4cab` and the pre-program
  `c7e466d9` remain available; no rollback image was pruned.
- A publication-level rollback can atomically return the stable pointer to a
  prior immutable edition or withdraw it while retaining events and editions.
- A full database rollback uses the verified pre-migration backup together with
  a previous image. Migration `down` was proved on the temporary copy; it must not
  be run over live publication rows as a substitute for the backup procedure.
- No volume, database, backup, running container or rollback image was removed.

## 4. Study Songs publication receipt

### Source snapshot

| Field | Value |
|---|---:|
| source works | 77 |
| text/table rows | 3106 |
| original-audio references | 2160 |
| source works SHA-256 | `60856a4cd9d053a30d269e1f504c015c324dabfb5bc207c829f44bdb6e814074` |
| source assets SHA-256 | `ce4d7c030853bfa6e587b1a62c7d55d49e4d3409a84422f6d8e92a41dfdc444b` |

### Public aggregate

| Field | Value |
|---|---|
| corpus ID | `pc_f978671108e0f8b97342e22d` |
| status | `PUBLISHED` |
| current edition | `ed_016c8b8a2bd06dd389bd9118` |
| edition number | 2 |
| published songs | 77 |
| immutable stored audio assets | 2155 |
| audio references resolved across works | 2160 |
| technical exceptions / `asset_missing` | 0 |
| package complete | `true` |
| manifest SHA-256 | `6e01c015e9ef2e0ccc05fc319027ca8e327df16b5ace4c1a9287272c83648d0f` |
| ZIP bytes | 43154649 |
| ZIP SHA-256 | `8d93ffed8c9049edef0743483b9afa550b7f1a4ad26f553147f29f01765482dd` |

Five audio references share already-identical content hashes across works. They
are represented by one immutable content-addressed file each, hence 2160 resolved
work references and 2155 physical immutable assets. This is deduplication, not an
asset omission; all 77 works have their declared audio available.

The pilot remains immutable as edition 1 (3 songs). Edition 2 is the full public
snapshot and is the current stable pointer.

### Rights facts

For the current edition, production read-back returned exactly:

| Permission | Facts | Allowed | Basis | Asserted at |
|---|---:|---:|---|---|
| `PUBLIC_READ` | 77 | 77 | `OWNER_ATTESTATION_2026_08_20` | `2026-08-20` |
| `PUBLIC_STREAM` | 77 | 77 | `OWNER_ATTESTATION_2026_08_20` | `2026-08-20` |
| `PACKAGE_DOWNLOAD` | 77 | 77 | `OWNER_ATTESTATION_2026_08_20` | `2026-08-20` |

The eight append-only production events are two sequences of
`DRAFT_CREATED -> ITEMS_COPIED -> RIGHTS_PRESET_APPLIED -> PUBLISHED`, first for
the pilot and then for the full edition. A final `--apply` run returned
`full_receipt=null` and left the event count at 8, proving restart idempotency.

## 5. Test and security evidence

### Required publication gates

- `smoke:mass-access:p0:red`: `GUARDS=8/8`, `IMPLEMENTED=14/14`,
  `PENDING=0`, `EXIT=0`.
- Focused Node suite: 17/17 pass. It covers migration up/down/reapply,
  immutable hash/read-back, atomic pointer rollback, append-only events,
  idempotency, source-preserving copy, per-item rights, missing-audio honesty,
  publisher isolation, anonymous route purity, public adapter, Publication
  Center, responsive/a11y controls, shared-asset deduplication and cached Range.
- RU/EN/HE i18n smoke: 233/233 pass.
- Local API/security smoke: anonymous read without membership; independent
  read/stream/download enforcement; owner/publisher authorization; CSRF;
  cross-tenant isolation; generic not-found/withdrawn response; Range audio; ZIP;
  stable pointer; public GET state preservation.
- Local browser smoke: desktop, RU 380x844, HE/RTL 380x844, 200% publisher
  surface, keyboard/focus, accessibility labels/live regions, reload,
  offline/reconnect, cache skew, audio and ZIP.

The repository-wide `npm test` is not represented as green: it reported 1021
passes and 52 failures out of 1073. These are existing baseline-drift tests (for
example migration-count/version literals and classic UI selectors already stale
at `c7e466d9`), not failures introduced or weakened by this program. No unrelated
guard was edited to manufacture a green result; the scoped publication gates
above are fully green.

## 6. Production API and browser smoke

Fresh anonymous Chromium contexts were used; the owner's real browser profile
was not used for mutation testing.

| Check | Production result |
|---|---|
| three consecutive `/healthz` reads | 200; `db.ready=true`; `migrations.ready=true` |
| client config / service worker | `3.11.417` / `v3.11.417` caches |
| catalog | 200; 77 songs; edition 2 |
| stable URL reload | PASS |
| immutable work read | 200; snapshot and audio list present |
| original audio Range | 206; `bytes 0-1023/20928`; 1024 bytes; `audio/mpeg` |
| offline cached audio Range | 206; requested 2 bytes returned |
| cache/offline/reconnect | PASS |
| ZIP body | 200; `PK`; 43154649 bytes; SHA-256 matches edition |
| unknown public corpus | 404 `PUBLIC_MATERIAL_NOT_FOUND` |
| public assets / adapter / Publication Center bundle | 200 |
| RU desktop | PASS |
| RU 380x844 | no horizontal overflow; no undersized tested targets |
| HE/RTL 380x844 | `lang=he`; `dir=rtl`; no horizontal overflow |
| EN 380x844 | `lang=en`; `dir=ltr`; guest-first copy present |
| keyboard-only | visible focus and reachable tested public controls |
| console/network | public requests 200/206; only expected guest 401s on protected auth/group endpoints |

The browser reported one generic form-quality issue for fields without `id` or
`name`; the visible public search input nevertheless has both an accessible
`aria-label` and localized placeholder. It does not block keyboard or assistive
name coverage and no public API/page error was observed.

Committed local reference screenshots are in
`docs/research/mass-access-public-corpora/2026-08-20/implementation/screenshots/`.
The live HE/RTL production viewport was also inspected visually after the final
deploy.

## 7. Production incidents found and closed

1. The first full publication attempt exposed five cross-work duplicate audio
   hashes. The canonical full-edition transaction rolled back; the immutable
   pilot remained valid. Commit `4eafa64d` deduplicates edition storage by content
   key while preserving each work's audio references. The full publication then
   completed with 77 songs and zero missing assets.
2. Raw HTTP Range was correct, but Chromium failed because Cache API rejects
   `206 Partial Content` in `cache.put`. Commit `67afe3fd` caches the full immutable
   asset and synthesizes the requested byte slice. Online and offline Chromium
   Range checks now both return `206`.

## 8. Disk and operations

- Initial observed production disk use during the program: approximately
  55-61%.
- Final host `df`: 26 GiB used of 38 GiB, 11 GiB available, 71% used.
- Final `/healthz`: 72%, `disk_warn=false`.
- Docker: 13 images / 8 active; 10.74 GB images; 3.924 GB reclaimable build
  cache; all 8 containers running.
- The allowed cleanup was not needed and therefore was not executed.
- Volumes remain 3/3 active; no volume prune, running-container delete, database
  delete or backup delete occurred.

## 9. Commits

1. `62a00896` — `test: define I1 publication domain red contract`
2. `2e3e5f64` — `feat: add immutable publication domain and repository`
3. `8b30bbca` — `feat: add owner Publication Center`
4. `445f8d1c` — `feat: add anonymous public Room adapter`
5. `73543aa6` — `test: gate public corpus browser and security flows`
6. `0eda4cab` — `test: add Study Songs production publication gate`
7. `4eafa64d` — `fix: deduplicate shared publication audio assets`
8. `67afe3fd` — `fix: serve cached public audio range requests`
9. Final evidence commit — this document.

All commits were made from explicit allowlists. Unrelated dirty files, owner
notes, older planning documents and unrelated screenshots were excluded.

## 10. Acceptance boundary

### Physically/automatically verified

- production migration, backup presence/integrity and temporary rollback;
- production DB/read-back, immutable editions, pointer, events and rights rows;
- anonymous public URL in fresh Chromium;
- original audio online/offline Range and full ZIP body/hash;
- RU/EN/HE, Hebrew RTL, desktop and 380x844 Chromium;
- keyboard focus, tested accessible names/live regions, overflow and console;
- source and learner/private/review invariants;
- application assets, version, health, disk and rollback images.

### Owner-device acceptance still not run

- physical iPhone Safari;
- physical Android browser;
- VoiceOver and TalkBack;
- receiving the actual file through real Telegram, WhatsApp or Files share
  targets.

Chromium evidence is not promoted to any of those owner-device/assistive-
technology PASS claims.

## 11. Final invariants

- `B9=FROZEN`.
- Closed Study Songs source corpus remains 1 corpus / 77 works / 2160 audio
  references with the original hashes; no source item was modified, moved or
  deleted.
- `review_log=7420`, `learner_events=80`, `learner_artifacts=117`,
  `learner_artifact_meta=116`; no learner/review writer was invoked.
- No owner-source write and no owner-profile mutation was performed.
- Public anonymous GETs left publication event, source, learner and review counts
  unchanged.
- New songs do not inherit the snapshot attestation silently; the owner must use
  the owner-only Study Songs rights preset on selected new materials.
