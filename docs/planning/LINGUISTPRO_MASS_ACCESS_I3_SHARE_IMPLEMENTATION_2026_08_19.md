# LinguistPro MASS-ACCESS I3 — Send or save implementation

Date: 2026-08-19

Status: `LOCAL IMPLEMENTATION COMPLETE · NON-DEPLOY BRANCH · OWNER DEVICE ACCEPTANCE PENDING`

Branch: `mass-access-i3-share-implementation`

Predecessor: [MASS-ACCESS P0 detailed design and red-test contract](LINGUISTPRO_MASS_ACCESS_P0_DETAILED_DESIGN_AND_RED_TEST_CONTRACT_2026_08_19.md)

## 1. Authority

The owner approved the isolated successor slice:

```text
APPROVE MASS-ACCESS-I3-SHARE-IMPLEMENTATION:
SCOPE=SHARED_SEND_OR_SAVE_STUDIO_FIRST;
ROOM=DESIGN_ADAPTER_ONLY_UNTIL_STUDIO_GREEN;
MIGRATION=NO;
OWNER_DATA_WRITES=NO;
DEPLOY=NO;
B9=KEEP_FROZEN;
COMMIT=YES;
PUSH=NON_DEPLOY_BRANCH
```

The Studio implementation and red checks were made green before the Room adapter was
added. No publication schema/API, public corpus adapter, Mentor/B9 feature, production
operation, migration or deploy is included.

## 2. Delivered behavior

### Shared contract

`public/js/share-service.js` is a UI-free service that separates four outcomes:

1. `buildLearningPackage` returns reusable ZIP bytes, manifest and exact audio facts;
2. `shareFile` attempts a file hand-off during the user's click activation;
3. `saveFile` starts a browser download without claiming that the file was kept;
4. `shareLink` hands off a URL without confusing it with a downloadable package.

It also preserves the four P0 trust domains: public link, private learning ZIP,
protected link requiring recipient access, and publisher preview link. The service
owns no learner state, corpus authorization or publication write.

ZIP construction clones the exported snapshot, de-duplicates audio keys, uses bounded
parallel fetches and eight-second per-asset timeouts, writes available audio with
`STORE`, and records missing assets in both `manifest.json` and
`metadata/missing_audio.json`. An aborted build emits no artifact.

### Studio

The Library v3 text-card action is now **Send or save**:

- the primary artifact is a per-text learning ZIP;
- the same prepared bytes are reused by Share and Save;
- native Share is shown only when `navigator.canShare({files})` accepts the ZIP;
- Save becomes the primary fallback otherwise;
- expected/included/missing audio counts are visible before either action;
- partial packages are named honestly;
- JSON remains under collapsed Compatibility and diagnostics;
- Escape, focus trap, focus return and 44 px actions are present;
- opening the richer portable-material workspace closes this modal first, so only one
  dialog owns focus.

### Reading Room

Every local **My Texts** row now exposes **Send or save** under More actions. Its
bottom sheet uses the same ZIP builder and the same portable-material augmentation as
Studio, while remaining a Room-owned responsive adapter. It restores focus to More
actions and supports Escape, backdrop close, Tab trapping, RTL and 380 px layouts.

Protected group corpus sharing remains a protected deep link. Its share copy explicitly
states that the recipient needs corpus access; it never packages protected content as a
public file. Clipboard copy remains the normal fallback.

Public-corpus and publisher-preview payload kinds are present in the shared contract
but have no runtime entry in I3 because I1/I2/I4 remain unauthorized.

## 3. Outcome language

The UI never equates these states:

```text
ZIP_READY
SHARE_SHEET_COMPLETED
SHARE_CANCELLED
SAVE_STARTED
RECIPIENT_RECEIVED (not observable)
```

`SHARE_SHEET_COMPLETED` means only that the operating-system share promise returned.
The localized copy tells the learner that delivery depends on the selected application.
`SAVE_STARTED` asks the learner to check Downloads/Files; it is not a durable-write
receipt.

## 4. Localization and release lockstep

RU/EN/HE contain the same action, package, partial-audio, cancellation, unsupported and
protected-access vocabulary. Locale cache bust moved to `v170` and its hash lock was
regenerated. Studio, Room footer and service worker were advanced together to
`3.11.405`; Room module cache bust is `library-ui.js?v=405`.

The separate P0 copyright/takedown runtime requirement remains red and outside I3.
The owner-approved exact RU/EN/HE copy remains frozen in the P0 packet for its own
authorized slice.

## 5. Verification evidence

| Gate | Result | Evidence boundary |
|---|---|---|
| Shared service + Studio/Room integration | `12/12 PASS` | Node unit/static contract |
| i18n symmetry, cache bust and app/SW version | `233/233 PASS` | repository gate |
| Room UX maturity/version lockstep | `17/17 PASS` | repository gate |
| Studio 380 RU browser | `11/11 PASS` | isolated Playwright OPFS fixture |
| Room 380 HE RTL browser | `10/10 PASS` | isolated Playwright OPFS fixture |
| P0 contract | green guards pass; `R11/R12 IMPLEMENTED`; `12 RED`; exit `1` | expected partial implementation state |

Screenshots and the browser evidence passport are in
[the I3 research record](../research/mass-access-i3-share/2026-08-19/README.md).

Additional repository diagnostics exposed two unrelated baseline/harness issues:

- the portable-package repository suite expects migration `48`, while the current
  repository head reports `49`;
- the legacy group-corpus UI smoke tries to click Share while the newer group-access
  explanation dialog still owns pointer events.

Neither issue is in the I3 edit allowlist, and neither was relabelled as a product
PASS. The direct protected-link contract is covered by unit and static integration
tests.

## 6. R1–R17 implementation review

| Lens | I3 result |
|---|---|
| R1/R10 | no language generation, morphology or timing change |
| R2/R4 | one plain-language action, responsive sheets, keyboard/focus/RTL coverage |
| R3/R6/R7 | original text/source identities and portable history stay intact; no rights inference |
| R5 | Save is a first-class fallback; package assembly is local-first |
| R8/R9 | Studio and Room share capability where truth permits; partial audio is derived and labelled |
| R11/R12 | one builder artifact and one shared service; no second learner/publication truth |
| R13/R14/R15 | no migration; protected/public/private plans remain distinct; no private data is published |
| R16 | bounded concurrency, timeout, one package build reused by both actions |
| R17 | no Mentor, review, grading or B9 writer was touched |

## 7. Owner/device acceptance still required

Automation is not owner-live evidence. Before deploy, run with a disposable or chosen
test text, not irreplaceable owner data:

1. Android Chrome → Telegram: ZIP appears with the intended filename and can be opened;
2. Android Chrome → WhatsApp: same, including a partial-audio package;
3. iPhone Safari/PWA → share sheet and Files fallback;
4. save then import/read-back of the exact ZIP on another disposable profile;
5. cancel share: modal remains usable and Save still works;
6. protected group link: signed-in member succeeds, signed-out/non-member sees the
   existing non-enumerating access message;
7. VoiceOver/TalkBack focus and announcement pass.

These rows are `PENDING`, not inferred from Chromium automation.

## 8. Execution boundary

```text
MIGRATION=NONE
OWNER_PROFILE_READS=NONE
OWNER_DATA_WRITES=NONE
PRODUCTION_READS=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
B9=FROZEN
PHYSICAL_RECEIVING_APP_EVIDENCE=PENDING
```
