# M3: Windows pilot onboarding

2026-09-29; base `c3ee1213`; branch `feat/mentor-byoa-m3`.
Status: **LOCAL TECHNICAL PASS / OWNER REPORTED WINDOW PASS / PRODUCTION OWNER PILOT**.
Production 3.11.693 at `94d6166f`: [release verification](PRODUCTION_ROLLOUT.md).
Owner installed-helper connection and production Room → Hermes → explanation:
[live evidence](M3_OWNER_LIVE.json). The two-word title exposed a practice CTA
eligibility defect: 3.11.694 advertises practice only when the same server checker
can build it. Targeted context/transport/shell tests: 39 PASS; real fixture browser
practice/retry/resume still passes with unchanged review_log.

## Delivered slice

- Browser setup page RU/EN/HE, account entry without Telegram/sync prerequisite,
  explicit device approval, online/offline/revoke, advanced manual pairing.
- Five-minute, nonce-bound, single-use device enrollment; secret hashes at relay,
  cookie/CSRF approval, identity-specific rollout, seven-day owner pilot operation.
  Emergency off overrides all grants; bearer delivery and late results recheck access.
- Windows user-scoped Inno Setup installer, protocol/shortcuts, existing pinned
  Hermes detection, OAuth runtime contract probe, separate restartable connector.
  Credentials/status remain in the existing private Docker home; model tokens
  do not enter the installer or relay. Uninstall attempts server revoke and
  removes only connector state/container, retaining Hermes volumes.
- Downloads are account/rollout gated under `/api/tutor/downloads`; installer
  payload lives on the production data volume, not in git or the application image.
- Prepared [independent Hebrew review packet](HEBREW_REVIEW_PACKET.md).

## Decisions supplied by owner

Windows first, macOS/Linux later. First support existing Hermes; clean setup
follows. No editor available: prepare review materials, do not promote generated
keys to grades. No signing certificate: unsigned limited-pilot installer approved.

## Evidence

- `node --test tests/tutorContext.test.js tests/tutorTransport.test.js`: 17 PASS;
  transport re-run after additional enrollment HTTP/CSRF assertions: 12 PASS.
- Shell module + integrity/precache suites: 21 PASS.
- `python ops/mentor-connector/test_connector.py`: 5 PASS, includes nonce/expiry,
  no token in status, cancellation and one inference across delivery retry.
- `node scripts/premium/tutor-onboarding-smoke.js`: real isolated HTTP/browser
  approval, checkbox, claim, online, revoke, cross-user gate, guest, 380px RTL;
  no page errors. Screenshots in `m3-screenshots/`, visually inspected.
- `node scripts/premium/tutor-m1-browser-smoke.js --practice`: Studio/Room,
  source revisions, practice/retry/resume, unchanged fixture review_log; PASS.
- Installed `.exe` exit 0; installed PowerShell `-Diagnose` PASS; pinned Docker
  runtime `hermes_turn.py --inspect`: RUNTIME_CONTRACT_PASS, no model invocation.
- Owner explicitly reported the Windows window/labels/buttons look normal.
  Windows automation did not expose the PowerShell-hosted window; this is owner
  reported visual evidence, not automated native UI acceptance.

Build: `powershell -NoProfile -File ops/mentor-connector/windows/build.ps1`.
Requires Inno Setup 6. Output `.tmp/tutor-installer/` includes manifest SHA256.
Pilot artifact `LinguistProTutor-0.1.0-beta.1.exe`:
`5d86104f8e9525ee80b34ecafb168e02b40534a829642d77a90e36376ee0e1e3`.

## Remaining gates (not mass-ready)

Clean-machine installation, signed public distribution, macOS/Linux, UI
localization of native helper, real quota/reauth recovery, native uninstall
while Docker is offline, novice sessions and AT acceptance remain open.
Requires the exact supported Docker topology/image, not arbitrary Hermes installs.
When enrollment's final response is lost, reconnect explicitly; no secret replay
or automatic enrollment flood. Multi-tenant rate limits/load remain M7 work.
The signed installer and all M3 acceptance criteria are not declared complete.
