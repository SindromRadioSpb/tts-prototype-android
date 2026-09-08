# Native UI compatibility correction — 3.11.492

DEPLOYED_TECHNICAL_PASS: `70b779d7513310db807ff88aeee6fbc6025be227`.
Live assets verified 2026-09-08 02:23 UTC; two production browser runs passed.
Cache upgrade passed with actual service workers over exact release fixtures;
the first production-rollout attempt timed out and remains INCONCLUSIVE.
See [RELEASE_VERIFIED.md](RELEASE_VERIFIED.md) for evidence boundaries.

Source base: main `c91023c10d728cde5ad1d7164f2c80424872334a` (3.11.491),
plus evidence-only predecessor `ef0d30f1`. Owner report, 2026-09-08:
`--in-window is not supported anymore` and `NATIVE_UI_UNAVAILABLE` for video
`p9eV1khQUUY`. No source acquisition ran through that failed route.

## Cause and correction

The implementation consulted a-Shell `master`, but the owner's installed binary
matches the newer SwiftTerm2 branch. Its native terminal no longer supports
`jsc --in-window`, and its WebView handler has no `input:` route. The prior
DOM-only fake bridge validated our assumptions instead of host compatibility.
This is an implementation error, not evidence that the YouTube link is broken.

The correction uses the supported `internalbrowser` command. An ephemeral UI
listener binds **127.0.0.1 only** on the iPhone; both UI and Python remain inside
a-Shell, so Chrome background suspension is not part of the active transfer.
The browser polls real state and sends bounded commands over same-origin HTTP.
No jsc invocation or terminal-input bridge remains in this workflow.

R14: opaque 256-bit URL capability, exact Host, same Origin, session header,
JSON-only POST up to 4096 bytes, strict/idempotent commands, no CORS, restrictive
CSP, no media or arbitrary file endpoints. No listener on the production server.
R15: failed handshake closes the listener; normal return closes it. Existing
downloads/dependencies/old packages are preserved. R11: frozen engine byte parity
retained; synthetic media is still clearly labeled. R4: normal controls retained;
startup errors now have a specific explanation, not a guess about app closure.

## Primary sources inspected

All below refer to a-Shell SwiftTerm2 commit
`c26eb4e5429b023f408cb047ea6b4fad208c6b59` (2026-08-29):

- [SceneDelegate.swift](https://github.com/holzschu/a-shell/blob/c26eb4e5429b023f408cb047ea6b4fad208c6b59/a-Shell/SceneDelegate.swift):
  executeJavascript rejection, removed input handler, openURLInWindow, JavaScript
  navigation permission and visible browser state.
- [ExtraCommands.swift](https://github.com/holzschu/a-shell/blob/c26eb4e5429b023f408cb047ea6b4fad208c6b59/a-Shell/ExtraCommands.swift):
  internalbrowser dispatches openURLInWindow asynchronously in the same app.
- [mini Info.plist](https://github.com/holzschu/a-shell/blob/c26eb4e5429b023f408cb047ea6b4fad208c6b59/a-Shell-mini-Info.plist):
  HTTP web-content support; no app configuration change is requested.
- [Package.swift](https://github.com/holzschu/a-shell/blob/c26eb4e5429b023f408cb047ea6b4fad208c6b59/xcfs/Package.swift):
  FFmpeg/FFprobe are native binary frameworks, not the removed terminal UI bridge.

## Verification and reproduction

- `python -m unittest discover -s scripts/premium/tests -p 'test_iphone*.py'`:
  25 PASS. Includes real HTTP origin/session/route/body-limit checks, timeout
  listener cleanup, handshake, state, and preserved storage/security tests.
- `npm test`: 1377/1377 PASS; `npm run test:api-smoke`: PASS;
  `npm run smoke:ingest`: 22/22 PASS; i18n: 233 PASS.
- `node scripts/premium/iphone-downloader-browser-smoke.js`: 13 groups PASS.
  New native UI fixture consumes the packaged renderer through an actual Python
  HTTP listener. No `window.webkit` mock or direct injected state rendering.
  Tested quality choice, real state polling, reload, cancel, retry and delivered
  preview/return commands. Media content and actual iOS app launch are NOT tested
  by this fixture; fixture screenshots name their fake media explicitly.
- `node scripts/premium/iphone-downloader-upgrade-smoke.js`: start against
  production 3.11.491 before deployment; waits for 3.11.492, uses the ordinary
  Studio Update button and checks the new helper after two reloads with the
  real service worker enabled. Output in `upgrade/` when completed.
  `--fixture` instead serves exact Git release bytes on a disposable local origin
  and deterministically transitions from 3.11.491 to 3.11.492; this passed and is
  recorded separately in `upgrade-fixture/`, not presented as live rollout proof.
- Browser production repeat uses `LP_IPHONE_DOWNLOAD_BASE` and
  `LP_IPHONE_TEST_PYTHON` (if Python needs an explicit path).

Build: `python scripts/premium/build-iphone-downloader.py`.
New immutable helper: `iphone-downloader-6a4996c9cb7a307f.pyz`, 43097 bytes,
SHA256 `6a4996c9cb7a307f128861a73eb20f49a38860503773e74dff17ae7af4f41c31`.
Generated reports/screenshots live in `local/`, `production/`, `upgrade/`.
They are evidence, not source or owner annotation files; do not edit them.
The owner-facing document to review is this README. Scratch caches are not inputs.

## Owner retry

In Chrome open Studio and accept its ordinary Update prompt if offered. Then
open https://linguistpro.kolosei.com/download-media.html ; footer should show
**3.11.492**. Tap Open helper on the failed history entry, or enter the URL again
and confirm download rights. The new helper is fetched and checked automatically;
do not reinstall a-Shell, delete files or type terminal commands.

Expected next screen is LinguistPro inside the helper, then actual video title
and available qualities. Keep a-Shell foreground. Choose quality, download,
open/play with sound, then return to Chrome. ASR remains untouched.

Physical iPhone acceptance of this corrected UI is **NOT_TESTED** until the
owner repeats the route. The old 3.11.491 UI is OWNER_REPORTED_FAIL; the original
engine qualification remains separately OWNER_REPORTED_PASS.
