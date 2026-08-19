# LinguistPro MASS-ACCESS I5 — Mentor connection implementation

Date: 2026-08-19

Status: `LOCAL IMPLEMENTATION COMPLETE · PRODUCTION DEPLOY AUTHORIZED · PRODUCTION VERIFICATION PENDING`

Branch: `mass-access-i3-share-implementation`

Predecessor: [MASS-ACCESS P0 detailed design and red-test contract](LINGUISTPRO_MASS_ACCESS_P0_DETAILED_DESIGN_AND_RED_TEST_CONTRACT_2026_08_19.md)

## 1. Authority and boundary

The owner authorized goal-mode completion through production after approving D6:

```text
D6=MENTOR_INLINE_ACCOUNT_SYNC_TELEGRAM_JOURNEY
MIGRATION=NO
OWNER_DATA_WRITES=NO
B9=KEEP_FROZEN
DEPLOY=YES
```

This slice implements only `P0-R13`. It does not authorize the publication
migration, public-corpus writer, B9 Curated Paths & Assignments, or synthetic
learner/mentor state.

## 2. Product result

The Reading Room Mentor now starts with one progressive journey:

1. Account — optional sign-in; local reading remains available to a guest.
2. Sync — an explicit action through the existing Cloud Sync writer.
3. Telegram — connect and confirm in Telegram; a pending user can reopen the bot.
4. AI capabilities — optional and separately consented after Telegram.

Only the current available action is exposed. Later steps are visible but locked,
so the user understands the path without being asked for every permission at once.
The journey is localized in RU/EN/HE and uses logical layout for RTL.

## 3. Truth and writer ownership

- `mentor-connection-core.js` derives presentation state from bounded facts only.
- Account truth comes from the existing authenticated Cloud Sync session.
- Sync readiness comes from the existing local `last_sync_at` state.
- The host reuses `_cloudRunSync(false)`; no second login or sync writer exists.
- Telegram truth comes from `/api/agent/telegram/status`.
- The status route returns only a safe bot URL and masked link status; it never
  returns a raw pairing token.
- AI consent remains owned by the existing consent endpoints and controls.
- Opening the Mentor or the connection journey performs no owner-data write.

## 4. Failure and recovery states

- A guest receives an active Account step, not a dead-end explanation.
- A browser-profile/account mismatch fails closed at Account.
- Sync progress and failure are announced in a polite live region.
- Pending Telegram provides a safe route back to the bot for `/confirm`.
- If the versioned core is missing because of cache skew, the Mentor asks for a
  refresh instead of rendering an invalid journey.
- The existing Cloud modal and lower Mentor blocks remain the canonical recovery
  and management surfaces.

## 5. Accessibility and responsive contract

- minimum action height: 44 px;
- visible `:focus-visible` treatment;
- semantic ordered list and `aria-current="step"` for the active state;
- `role="status"` plus `aria-live="polite"` for sync feedback;
- RU/EN/HE at 380 px, including Hebrew RTL without horizontal overflow;
- keyboard focus moves to the existing account, Telegram or consent control.

Automated Chromium evidence is not relabelled as physical iPhone,
VoiceOver/TalkBack, Telegram, WhatsApp or Files evidence.

## 6. Changed runtime surface

- `public/js/mentor-connection-core.js`
- `public/js/mentor-home.js`
- `public/js/library-ui.js`
- `server.js`
- `public/library.html`, `public/index.html`, `public/sw.js`
- RU/EN/HE locale files and their cache/version locks

No schema, migration, owner profile, corpus data, review log or B9 file is changed.

## 7. Verification before deployment

```text
mentor connection core + integration       11/11 PASS
Room/B6/VF regression bundle               43/43 PASS
i18n smoke                                233/233 PASS
Mentor Home smoke                           25/25 PASS
Telegram pairing smoke                      33/33 PASS
API smoke                                       PASS
browser RU/EN/HE + RTL + keyboard           14/14 PASS
P0 guards                                     8/8 PASS
P0 implementation matrix       4/14 implemented, 10 pending (expected exit 1)
```

The browser run uses isolated scratch state and route fixtures. It does not open the
owner profile and does not grant consent, pair Telegram or execute sync.

## 8. Release and rollback

Target runtime: `3.11.414`.

Production acceptance requires consecutive stable `/healthz` responses, matching
served app/service-worker/assets, and the same isolated browser journey against the
production origin. Rollback is the previous production runtime commit; no database
rollback is required because this slice has no migration.

Physical receiving-app and assistive-technology rows remain owner/device acceptance
work after production automation is green.
