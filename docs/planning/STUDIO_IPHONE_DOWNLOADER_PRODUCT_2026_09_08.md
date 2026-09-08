# iPhone video downloader: product delivery

Date: 2026-09-08. Owner direction: finish and deploy a mature Chrome/iPhone
download flow; **do not touch transcription**. Base main/production:
`97dee98f1dbe145eef8a5a7bfa31c283b22793b5`, 3.11.490.

## Superseding correction — 3.11.492

DEPLOYED_TECHNICAL_PASS: `70b779d7`. Live assets + two 13-group production browser
runs verified. Exact-release cache-upgrade fixture passed; first real-rollout
upgrade attempt timed out (INCONCLUSIVE). Corrected physical iPhone path pending.

Owner testing of 3.11.491 FAILED at native UI startup:
`--in-window is not supported anymore` followed by `NATIVE_UI_UNAVAILABLE`.
This happened before source resolution/download; it does not invalidate the
earlier owner-qualified engine or establish a failure of the supplied video.
The original native design below is historical and superseded.

Root cause: `master` retains the old WebView terminal; current shipped behavior
matches `SwiftTerm2` (`c26eb4e5429b023f408cb047ea6b4fad208c6b59`). It removes both
the in-terminal jsc option and the old `input:` message handler. Browser tests
mocked that removed handler and thus did not independently test compatibility.

Correction: `internalbrowser` opens a packaged UI on an ephemeral 127.0.0.1
listener inside a-Shell. Commands and state use actual HTTP, not jsc, terminal
stdin or a fake WebKit bridge. Binding: exact Host, opaque 256-bit path, same
Origin, session header, JSON and 4096-byte body cap, strict command grammar and
idempotent sequence. No CORS, media route, owner-file route or arbitrary command.
Listener closes on failed startup and process return. Native preview and the
frozen download/verification engine are unchanged; no ASR changes.

Gates before release: 25 Python PASS, 1377 full Node PASS, API smoke PASS,
ingest 22 PASS, i18n 233 PASS, 13 browser groups PASS. New browser test uses a
real Python listener, real page requests and real state/commands, including
reload, cancel, retry, preview and return. Media/native app launch remain
TEST_FIXTURE_ONLY / NOT_TESTED respectively. Never upgrade that to iPhone PASS.
Details: `docs/research/studio-iphone-downloader/2026-09-08/native-ui-fix/README.md`.

## Established evidence and scope

The owner accepted installation of free a-Shell mini. Owner-reported native
preflight passed Apple WebKit and FFmpeg, Python 3.13.1+, yt-dlp 2026.08.19.
Two M4A downloads and one MP4 download completed on the physical iPhone.
The owner confirmed video with sound, selected the MP4 in Studio/Chrome iOS,
and reported the exact-file play/seek PASS at 25%/75%,
`2026-09-08T00:25:42.976Z`. Video SHA-256:
`36daf31cc2fe8e721c13d06baf4c5e518f51370404d5db6ea44bf564a38a07fd`.
These are OWNER_REPORTED_PASS for the qualification route, **not** for new UI,
deep-link launch, new helper controls, share sheet or interruption recovery.

Predecessors: `STUDIO_IPHONE_CHROME_LOCAL_MEDIA_2026_09_08.md` on feature
`78dd8996`, and `STUDIO_IPHONE_CHECK_RELEASE_2026_09_08.md` on main.
The immutable qualification ZIP already shipped on main is the engine input:
`public/downloads/linguistpro-iphone-probe-0744253a.zip`, SHA-256
`0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282`.
The new package reuses that exact probe/runtime installer and engine, byte for
byte. No second implementation of yt-dlp planning or codec verification.

## Interaction contract

Studio Video offers **Download on iPhone**, opening a dedicated product surface
on the same origin. The owner supplies a YouTube URL and per-download rights.
One button opens a-Shell mini; a fixed, hash-pinned bootstrap installs the small
LinguistPro helper and isolated dependencies automatically. No copied commands,
ZIP unpacking, pickFolder, configuration edits or paid account is required.

The helper displays a focused LinguistPro screen over its terminal. A tested
bidirectional UI handshake is required before source acquisition. It resolves
the source locally, shows its real title/duration and available compatible
qualities, then downloads the owner's selection. Progress is real byte/phase
evidence, not a timer or a browser promise of completion. Keep helper foreground;
background continuation is not promised. Cancel is cooperative and acknowledged.

Verified results receive readable names under a-Shell mini's
Documents/LinguistPro/Downloads. Native preview exposes iOS sharing/saving.
Returning to Chrome is explicit and carries only bounded result metadata in a
fragment. Browser history labels this as a helper report, not an independently
verified File, OPFS import, or remote-worker receipt. Reopening the helper checks
the actual saved bytes again. Browser history removal never deletes media.
An interrupted attempt can be retried; do not claim byte-range resume.

## Roles and design review

R4/R5: one task, one next action. Existing system font and Studio foundations:
page #f4f6f9, surface #ffffff, text #0f172a, secondary #475569,
accent #2563eb, success #166534. 380px first, RU/EN/HE and RTL, 44px controls,
visible keyboard focus, dark mode and reduced-motion support. No hero image or
decorative dashboard; active-state transition and real progress provide motion.
Frontend-design and frontend-skill informed restraint and utility copy.

R9/R11: preserve the owner evidence exactly; new native bridge needs its own
physical-device acceptance. Fake backend tests must say TEST_FIXTURE_ONLY.
R12/R13: journal is not library canon; no OPFS, schema, media-import or ASR change.
R14: fixed origin/artifact hashes; strict ID/rights/action/locale grammar; no
arbitrary shell text, signed source URL, token, credentials or remote EJS update.
Callback metadata is untrusted and bounded; it cannot authorize writes/import.
R15: only dedicated helper paths; no user setup/profile/global pip modifications;
local retained media is not uploaded or silently purged. R16: no media server,
proxy, cloud ASR or new infrastructure; only small static application assets.

## Allowlist and gates

New downloader page/CSS/browser and native UI JS, helper source/build scripts,
immutable generated helper archive and manifest, targeted Node/Python/browser
tests and stable evidence; three locales; Studio navigation only; coordinated
APP_VERSION/SW/Room footer and exact version locks. No transcription/readiness
function changes. Do not merge the unrelated server-downloader feature branch.

Red tests first: payload/command safety, callback binding and false success,
artifact tamper/path traversal, native UI handshake, persistence/reopen/hash,
cancel/retry/failure and no media-server/ASR. Then full Node suite, API/ingest,
isolated browser actual downloads/clipboard-free launch/reloads, 380px RU/HE,
dark/desktop/accessibility. Inspect screenshots before commit. Publish a scoped
fast-forward main commit only after gates; verify live commit/version/assets and
repeat browser tests. Keep physical-device checks explicitly pending until run.

## Primary implementation references (checked 2026-09-08)

- https://github.com/holzschu/a-shell/blob/master/a-Shell/SceneDelegate.swift:
  ashell URL handler, jsc --in-window, aShell input bridge, native preview.
- https://github.com/holzschu/a-shell/blob/master/a-Shell/ExtraCommands.swift:
  jsc and browser commands.
- https://github.com/chromium/chromium/blob/main/docs/ios/opening_links.md:
  fixed googlechromes return opens Chrome, not a file-import API.

Status: DEPLOYED_TECHNICAL_PASS, 3.11.491, commit `c91023c1`.
Live verification completed 2026-09-08 01:29 UTC; 15 live assets matched committed
bytes, health 200, two independent 12-check browser runs PASS. See evidence README.
New physical-device interaction acceptance remains NOT_TESTED.

Local gates: 22 Python protocol/storage/package tests; 6 focused Node tests;
1377/1377 full Node suite; API smoke PASS; ingest 22/22 PASS. Browser harness:
12 grouped checks PASS, including actual helper archive download/SHA256,
custom-scheme navigation, two reloads, adversarial callback, Studio navigation,
RU/EN/HE, 380px/desktop/dark and native UI fixture. Screenshots inspected.
The native UI fixture is TEST_FIXTURE_ONLY, not execution in iOS/a-Shell.
Final helper: 40433 bytes, SHA256
`e1e5906d9803b052899ed729e05fdc02b38284ddaaa6f55758c0dd54eec22000`.
Changes to `studio-import.js` and `media-readiness.js`: NONE against base main.
