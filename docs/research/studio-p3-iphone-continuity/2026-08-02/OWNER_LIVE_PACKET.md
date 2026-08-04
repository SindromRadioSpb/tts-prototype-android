# P3 real iPhone manual continuity — owner-live closure

> **Date:** 2026-08-02
> **Production release:** `v3.11.296` / `ead4a550bfe3f1cff6b5980ddbfd9ce106442504`
> **Browser schema:** `MIGRATIONS.length=47`
> **Status:** **COMPLETE / OWNER-ATTESTED REAL IPHONE PASS**
> **Scope:** manual browser-local PC↔iPhone continuity only; no cloud sync, automatic media
> transport, server data/schema, E2EE, Hermes or concurrent editing.

## 1. Owner attestation

The owner explicitly confirmed completion of the full P3 chain on a real iPhone:

```text
PC export
  → Files/iCloud transfer
  → iPhone import
  → no-write dry-run
  → exact-SHA media relink
  → video/cue/row playback
  → cold reopen
  → re-export
  → semantic parity
```

This is owner-live evidence, not a synthetic-browser inference. The final production recovery build
had already passed automated desktop RU, 380 RU/LTR and 380 HE/RTL gates with zero provider calls
and zero page errors. P3 adds the real-device continuity proof that automation could not supply.

## 2. Evidence boundary

Confirmed by the owner:

- package created on PC and transferred through Files/iCloud;
- iPhone accepted the package through the supported browser-local surface;
- verification/dry-run preceded Apply and did not write before confirmation;
- media bytes travelled separately from `.lplp.zip` and relinked only after exact SHA verification;
- video, exact cue playback, mapped learning-row playback and table continuity worked;
- the local material survived a cold reopen;
- re-export represented the same semantic material rather than a duplicate/fork;
- no automatic provider/model call or automatic media transport was part of the flow.

Known fixture context from the final P2 recovery ledger:

- real long-form owner material;
- 514 caption cues;
- 585 current learning-table rows;
- four caption revisions and two table revisions;
- durable import receipt and exact media binding;
- no conflicts after recovery.

## 3. Metadata not copied into the record

The owner's confirmation did not include the exact iPhone model, iOS/WebKit build, free-disk
measurement, per-stage timings, full package/media hashes or screenshots from the final successful
run. These values must not be invented. Their absence is an evidence-metadata limitation, but the
owner explicitly declared the complete P3 functional chain successful and instructed the project to
close P3. Future regression runs should capture them when convenient.

No transcript content, private filenames, full device identifiers, storage paths or private
production coordinates are committed in this packet.

## 4. What P3 proves

- The manual package path is a viable cross-device product fallback.
- Package identity and immutable caption/table history survive device transfer.
- Media-free package plus explicit exact-SHA relink is understandable and operational.
- Missing media does not mean lost transcript/table data.
- Cold reopen preserves the imported canon and binding.
- Re-export can preserve semantic identity after the iPhone round trip.

## 5. What P3 does not prove or authorize

- no automatic device sync;
- no media upload/download service;
- no shared OPFS between Safari and an installed PWA;
- no concurrent multi-device editing or conflict merge;
- no E2EE vault or recovery-key UX;
- no Hermes content access;
- no server-side replica as authority;
- no provider-default or fallback changes.

The manual ZIP/relink route remains required even if a future separately approved sync capability
is added.

## 6. Product findings handed to P4

The end-to-end journey works, but it crosses several existing surfaces and requires the user to
maintain a mental model of package scope, local media, receipts and the next safe action. P4 must
reduce that burden without creating another source of truth.

P4 therefore starts from these owner-proven needs:

1. one Import Center entry available in an empty profile, Library card and active Workspace;
2. a material lifecycle rail that distinguishes local canon, media availability and external backup;
3. guided PC→iPhone, restore, relink, recovery and delete/export tasks;
4. storage/quota/codec/SHA diagnostics in user language;
5. an honest distinction between “package generated” and “confirmed saved elsewhere”;
6. recovery guidance that never recommends repeat ASR when immutable transcript history exists;
7. exact links back to correction, table, study and source playback;
8. RU/LTR and HE/RTL mobile-first behavior with no dead ends.

The exact P4 contract is:

`docs/planning/STUDIO_INGEST_P4_IMPORT_CENTER_IMPLEMENTATION_PACKET_2026_08_02.md`.

## 7. Final verdict

```text
P2 Portable Learning Package v2 + Recovery UX ✅ OWNER LIVE PASS
P3 real iPhone manual continuity              ✅ OWNER-ATTESTED PASS
P4 Import Center                              ✅ COMPLETE / PROD PASS / OWNER LIVE PASS v3.11.300
```

Post-P4 closure is recorded in
`docs/research/studio-p4-import-center/2026-08-02/OWNER_LIVE_PACKET.md`; it does not grant authority
for autosync, Hermes or any other subsequent slice.

P3 is closed. Reopening it requires a concrete regression or a new supported-surface decision, not
routine repetition of the already successful owner ceremony.
