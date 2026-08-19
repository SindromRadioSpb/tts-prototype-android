# MASS-ACCESS I3 — Send or save browser evidence

Date: 2026-08-19

Status: `LOCAL AUTOMATION PASS · PHYSICAL RECEIVING APPS NOT TESTED`

Canonical implementation record:
[LINGUISTPRO_MASS_ACCESS_I3_SHARE_IMPLEMENTATION_2026_08_19.md](../../../planning/LINGUISTPRO_MASS_ACCESS_I3_SHARE_IMPLEMENTATION_2026_08_19.md)

## Harness

Run either surface separately:

```text
node scripts/premium/mass-access-i3-share-browser-smoke.js --studio-only
node scripts/premium/mass-access-i3-share-browser-smoke.js --room-only
```

The harness starts a local server and uses fresh Playwright browser contexts with
service workers blocked. It creates one fixture text inside each temporary browser
profile. It does not load the owner's Chrome profile, read production, deploy, invoke
a real receiving app or mutate owner data.

## Results

- Studio RU, 380 × 844: `11/11 PASS`.
- Reading Room HE RTL, 380 × 844: `10/10 PASS`.
- exact facts for a no-audio package: expected `0`, included `0`, missing `0`;
- Save is enabled and visibly primary when native file sharing is unavailable;
- dialog naming, Escape, focus containment/return, 44 px actions and horizontal fit
  pass on both surfaces;
- Room package reaches `ready` through the real local bundle and portable augmentation
  path.

## Screenshots

- [Studio Send or save · 380 px · RU](screenshots/studio-send-or-save-380-ru.png)
- [Room Send or save · 380 px · HE RTL](screenshots/room-send-or-save-380-he-rtl.png)

The screenshots show browser automation, not iPhone/Android, VoiceOver/TalkBack,
Telegram, WhatsApp or recipient delivery evidence.

## Boundary

```text
OWNER_PROFILE=NOT_OPENED
OWNER_DATA=NOT_READ_OR_WRITTEN
PRODUCTION=NOT_ACCESSED
DEPLOY=NONE
RECEIVING_APP_DELIVERY=UNPROVEN
B9=FROZEN
```
