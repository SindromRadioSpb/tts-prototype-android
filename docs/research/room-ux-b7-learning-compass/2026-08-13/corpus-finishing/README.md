# B7 corpus finishing — production evidence

Date: 2026-08-13

Status: **ENGINEERING PASS · PRODUCTION READ-BACK PASS · PHYSICAL/AT PARTIAL**

Production release: `3.11.372`; corpus finishing `main@9dd225f0`, sync
contract alignment `main@4818cd6e`, recoverable replay `main@9cf51982`.

Evidence class: local automation plus signed-in owner-profile read-only
production browser evidence. It is not physical-device or assistive-technology
acceptance.

## What this packet proves

- My Texts, Study Songs and Ben-Yehuda are prepared before selection and expose
  the same `Сначала достоверно знакомые` command.
- The three presenters use one visible audio contract only:
  `Аудио полностью N/N`, `Аудио частично N/N`, or `Аудио отсутствует`.
- Card identity/evidence follows the UI locale: RU/EN starts at the left even
  for Hebrew titles; HE/RTL keeps the mirrored reading order.
- Learning Compass details are single-open and close on peer open, outside
  pointer-down, or `Escape`; keyboard focus returns to the summary.
- The Kfar Aza audit separates the `1,107 / 3,945 = 28%` token lower bound from
  the non-additive `479` distinct new-lemma inventory and exposes localized help
  for the distinction.
- Cloud replay accepts the bounded Room Training provenance fields and cannot
  advance past a rejected row or reuse a cached rejection. No grade, mark, or
  review event is synthesized.

## Verification sources

Local source commands:

```powershell
npm run smoke:room-b7
npm run smoke:cloud-sync
npm run smoke:i18n
npm run smoke:canon-version
npm run smoke:memory-canon
```

Results: B7 unit `46/46`, B7 browser `161/161`, cloud sync `32/32`, i18n
`233/233`, canon version `18/18`, and Memory Canon/FSRS `79/79`.

Production read-back used the actual owner profile only for navigation,
sorting, disclosure, layout and GET/network observation. Reader, grade/review,
word-status, calibration reset/disable and other learner mutations were not
invoked. All ten served assets checked against Git blobs matched byte-for-byte.

Before and after the complete three-corpus traversal, the counts and SHA-256
of `review_log`, `word_status`, `text_progress` and `texts` were identical;
`review_log` remained `7,282` locally and in cloud, with upload/download cursors
also at `7,282`.

## Operational read-back

Root disk use was reduced from `97%` to `82%` by deleting rebuildable builder
cache and three explicitly verified unused historical application images. The
active `3.11.372` image and immediate `3.11.371` rollback image were retained;
no running container or volume was removed. Three post-cleanup `/healthz`
samples returned `200`, `ok=true`, DB ready and migrations ready. The service
still reports `disk_warn=true` at `82%`, so this remains a documented operations
warning rather than a closed risk.

## Artifact boundary

[`PRODUCTION_READBACK_EVIDENCE.json`](./PRODUCTION_READBACK_EVIDENCE.json) is
the raw structured record for release/version, corpus observations, asset
hashes, canonical before/after checksums, automation and operations. This file
is the human review layer derived from that record and the listed source
commands. Physical iPhone/Android/NVDA/VoiceOver/TalkBack/macOS rows remain in
the canonical acceptance packet and are not inferred from browser automation.
