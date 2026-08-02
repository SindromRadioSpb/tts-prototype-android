# P2 Portable Learning Package v2 — owner-live packet

> Date: 2026-08-02
> Initial P2 release: `v3.11.289` / `da30fdbaf79f6751bee74406f73b093be742e76b`
> Final recovery release: `v3.11.296` / `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> Status: **COMPLETE / OWNER LIVE PASS**
> Authority boundary: browser-local P2 only. No server schema/data, cloud sync, provider,
> media transport, E2EE, Hermes, concurrent editing, L2/L4/L5/L6 or implicit fallback.

## Implemented contract

- pure derived Artifact Graph with exact node/relation allowlists and no graph registry table;
- canonical snapshot/archive serializer, semantic content root and media-free fixed-path package;
- strict JSON plus pre-extraction ZIP central-directory, size/count/ratio/path/special-file checks;
- additive browser migration v47 containing only `studio_portable_import_receipts`;
- no-write inventory/dry-run and unchanged-plan gesture gate;
- one `SAVEPOINT p2_portable_import` for insert/reuse/rebind/projection/receipt, with full fault rollback;
- durable receipt, cold-reopen idempotency, explicit undo and reverse-reference delete/GC stop;
- full-backup archive coverage or visible abort; compatibility projection remains derived;
- exact-SHA user-selected media relink; media bytes never enter the package;
- premium desktop and 380 px RU/LTR + HE/RTL UI with no server/provider path.

## Automated evidence

### Pure/repository/security/backup/UI

`npm run smoke:portable-learning-package` — PASS, 24/24 tests. The scoped fix includes a
red-before-green real-ASR decimal-provenance regression test.

Covered evidence includes duplicate JSON/ZIP names, traversal, compression ratio, missing and
corrupt entries, future schema, same-ID/different-hash, exact compatibility rebind, every Apply
write phase rollback, durable/idempotent receipt, external-reference delete stop, full-backup
coverage and independent oracle drift rejection.

### Performance

`npm run smoke:portable-learning-package:perf` — PASS.

| Fixture | snapshot export | archive export | snapshot verify | archive verify | first import | re-import | heap delta |
|---|---:|---:|---:|---:|---:|---:|---:|
| 514 rows / 20 revisions | 214 ms | 1,469 ms | 72 ms | 630 ms | 1,528 ms | 10 ms | 95 MiB |
| 2,800 rows / 20 revisions | 1,089 ms | 8,653 ms | 389 ms | 4,106 ms | 8,244 ms | 38 ms | 181 MiB |

All frozen packet ceilings pass. The package contains no media bytes.

### Fresh Chromium round-trip

`npm run smoke:portable-learning-package:browser` — PASS.

- separate ephemeral source and target Chromium contexts;
- archive export → strict ZIP verify → no-write dry-run → Apply → idempotent re-import;
- cold reload → durable committed receipt → re-export;
- source/re-export semantic content root exact match:
  `91b852cc84134b7dfd696c975353606f6a19be83f7157492f6ab857bfa414851`;
- manual RU field authority/lock preserved;
- desktop RU, 380 RU/LTR and 380 HE/RTL: no horizontal overflow, 44 px actions;
- provider/model calls: `0`; page errors: `0`.

Screenshots:

- `screenshots/p2-desktop-ru.png`
- `screenshots/p2-380-ru.png`
- `screenshots/p2-380-he.png`

## Production/owner ceremony ledger

| Check | Result |
|---|---|
| actually served APP/CACHE version | PASS — `3.11.289` / `v3.11.289` |
| production health/DB/migrations | PASS / ready / ready |
| post-deploy disk | 83% warning before bounded cleanup; 79%, warning false after |
| cleanup | 11 unused builder-cache records; about 1.35 GiB reclaimed; no images removed |
| real owner material export, no mutation | PASS — existing Chrome profile, 472 rows, snapshot + archive |
| real package strict verify | PASS — 17-entry snapshot, 18-entry archive, exact content roots |
| real dry-run | PASS — applicable, zero conflicts, exact media, all inventories unchanged |
| P2 provider/model calls | `0` |
| app/page errors during ceremony | `0`; only older Kapture-extension runtime errors existed |
| initial v3.11.289 owner data import/rebind/delete | NOT AUTHORIZED / NOT RUN |
| initial v3.11.289 real-device owner ceremony | NOT RUN |

The first read-only Kapture export on served `v3.11.288` found
`CANONICAL_NUMBER_INVALID` before ZIP creation. The real legacy ASR provenance contains finite
diagnostic decimal seconds/ratios while the package canon intentionally accepts JSON integers
only. The scoped `v3.11.289` fix serializes only those diagnostic decimals as shortest decimal
strings; strict canonical numbers remain unchanged. A red test reproduces the failure, and the
same transform built and strictly verified snapshot/archive from the real material in memory with
the receipt count unchanged.

At the initial v3.11.289 ceremony, automation was not labelled OWNER LIVE PASS. After that deploy
the already-open owner Chrome tab could
be used only to inspect the real material and perform a media-free export/read-only verification.
No Apply, relink, undo, delete or storage clearing is authorized against the owner's profile.

## Rollback

1. Roll code back to the pre-P2 client; do not drop migration v47.
2. Failed Apply already rolls back to the named savepoint and leaves no receipt.
3. For a committed synthetic import, inspect `reverseReferencePlan`; run explicit Undo only when
   it proves zero external references. Reused canon and media bytes remain untouched.
4. Any receipt/hash/dangling-reference disagreement stops rollback automation.

## Remaining owner-only proof

The table above is the immutable ledger for the initial v3.11.289 read-only ceremony. Subsequent
explicit owner authorities and evidence closed the remaining proof; see the addendum below.

## Final recovery and owner-live addendum — v3.11.296

The owner's real lifecycle smoke found and then closed four related user-facing gaps without loss of
canonical data:

1. global empty-profile discoverability and one coherent transfer/backup surface;
2. durable receipt history, Undo/recovery explanations and explicit repair states;
3. deleted compatibility projection restoration without duplicating the Artifact Graph;
4. a legacy exact-binding mismatch where the text binding named the correct immutable revision but
   an obsolete empty imported track, preventing local video and per-row source replay.

The final option-B implementation keeps the material, immutable caption/table revisions, receipt,
mapping and exact media package authoritative. Archive restores the compatibility card; historical
deletion can rebuild it from the verified source package; a binding-only mismatch is repaired under
one SAVEPOINT from the already verified immutable revision and needs neither provider calls nor a
second media upload. Empty obsolete tracks are deleted only when they were created by the receipt
and have zero revisions, bindings and child tracks.

Final automated evidence:

- Portable Learning Package: 39/39 PASS;
- Media Package: 52/52 PASS;
- Material Revision: 17/17 PASS;
- i18n: 233/233 PASS;
- desktop RU, 380 RU/LTR and 380 HE/RTL browser gates PASS;
- 514-row and 2,800-row/20-revision export/verify/dry-run/import ceilings PASS;
- full suite 739/748 with the same nine unrelated baseline failures;
- provider/model calls 0; HTTP/page/console errors 0 in the final read-only production handoff;
- actually served APP/CACHE `3.11.296` / `v3.11.296`; health, DB and migrations ready;
- post-deploy disk 83%→78%, warning false after bounded cache plus two exact-unused-image cleanup;
  active/newest rollback, 10 containers, three volumes, DB and user data remained intact.

Owner result:

- owner completed the one-click exact media binding recovery successfully on production;
- real receipt/material evidence remained idempotent with 514 cues, 585 current table rows, four
  caption revisions, two table revisions and zero conflicts;
- exact local media, player and cue↔row replay were restored and survived the owner's test;
- owner then completed the full P3 real-iPhone continuity ceremony recorded in
  `docs/research/studio-p3-iphone-continuity/2026-08-02/OWNER_LIVE_PACKET.md`.

Verdict: **P2 COMPLETE / OWNER LIVE PASS**. This does not close unrelated provider/fault/two-tab
ceremonies in older L3a packets and does not authorize P4, sync, E2EE, Hermes or server changes.
