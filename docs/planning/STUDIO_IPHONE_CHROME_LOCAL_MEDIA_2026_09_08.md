# Studio: iPhone + Chrome, device-local media acquisition

Date: 2026-09-08. Status: **IMPLEMENTATION STARTED / OWNER DEVICE GATE PENDING**.
Base: `c992300d5de5f5cdc9a1dc0cf272d3f8ab458321`, feature branch
`feat/studio-media-downloader-2026-09-08`; not production/main.

## Owner direction and non-negotiable boundary

The owner approved starting the prospective device-local route with no media-server
expense, explicitly requiring **iPhone**, then clarified **Chrome on iPhone**.
Desktop/Android-only success, a Safari-only extension and a home-PC relay do not meet
this direction. No paid API/proxy, new server, account-cookie extraction, DRM bypass,
automatic ASR or native-app signing purchase is authorized by this implementation.

Predecessors:

- `STUDIO_MEDIA_DOWNLOADER_IMPLEMENTATION_2026_09_08.md`: completed server-route
  implementation on the feature branch; actual production source route remains blocked.
- `STUDIO_MOBILE_MEDIA_ACQUISITION_NO_COMPANION_DECISION_PACKET_2026_08_11.md`:
  earlier no-installed-component scope. Its conclusion that a remote execution boundary
  is mandatory applies to that browser-only scope, not to a separately installed iOS runtime.

The five-step product flow remains the target. This revision does **not** redefine
manual terminal commands and a file picker as its completion.

## Candidate and deliberately narrow first implementation

Candidate: free a-Shell mini, using local Python + Apple WebKit + native FFmpeg.
Chrome remains the browser; a helper is a separate one-time installation. The owner has
not yet explicitly accepted installing this particular app. Installation on the phone
and acceptance of the resulting interaction remain owner decisions.

Implemented an owner qualification kit, outside the production UI:

- `scripts/premium/iphone-media-probe.py`: isolated pinned dependency installer;
  native-JS/codec preflight; public YouTube ID → existing planner/backend → real-byte
  verification → owner-visible local file/report; separate fixed Chrome return request.
- `scripts/premium/build-iphone-media-probe.py`: deterministic ZIP and per-file SHA-256
  manifest; existing engine sources copied mechanically, byte parity tested.
- `scripts/premium/tests/test_iphone_media_probe.py`: offline safety/packaging/contract tests.
- Stable deliverables and owner instructions:
  `docs/research/studio-iphone-local-media/2026-09-08/`.

Pins: yt-dlp `2026.8.19`, EJS `0.8.0`, Apple WebKit JSI `0.1.1`;
three pure-Python wheels with fixed URLs and SHA-256. No global pip upgrade, no runtime
download in the normal acquisition action, no extraction build scripts, no remote EJS
component update. Plugin v0.1.1 source was inspected at commit
`e466daca67cc0e1ca63b68cb8fbe80af16ce00a4`; this is a compatibility review, not a complete
third-party security audit or physical-device certification.

The runner does not call the LinguistPro acquisition API, start a local HTTP listener,
upload media, import browser cookies or initiate cloud ASR. It contacts PyPI only for
explicit runtime installation; source extraction/media transfer occur on the device.
Static hosting, device storage/battery and ordinary Internet access are not literally free.

## Evidence and limits

See the dated research README for exact commands/results. So far:

| Boundary | Evidence | Status |
|---|---|---|
| Isolated dependency install, hash check, no overwrite | Actual Windows ZIP install + offline tests | TECHNICAL_PASS |
| Shared-engine source parity and package reproducibility | Offline tests | TECHNICAL_PASS |
| iOS-only gate, rights-required gate | Actual packaged runner rejects desktop/unconsented download | TECHNICAL_PASS |
| Native Apple JS + FFmpeg subprocess support | Code provided, no actual iPhone execution | NOT_TESTED |
| Current YouTube extraction on iPhone | No actual iPhone execution | NOT_TESTED |
| Chrome → a-Shell mini URL launch | a-Shell source declares scheme/handler | SOURCE_CONFIRMED_ONLY |
| a-Shell mini → Chrome return | Chromium documents `googlechromes:`; runner sends fixed URL | DEVICE_NOT_TESTED |
| File selection, playback and persistence in Chrome | Manual owner steps only | NOT_TESTED |
| Five-step Studio UX and interruption recovery | Not implemented for local route | PENDING |

Windows native-plugin import was attempted separately and fails at missing
`os.RTLD_LAZY` (Darwin-only dependency). No workaround or mocked OS was used to turn
this into a pass. The packaged public preflight rejects Windows earlier with `IOS_REQUIRED`.

The output report is `lp-iphone-media-probe-v1`, **not** a signed remote worker receipt.
`LOCAL_BYTES_VERIFIED` cannot establish Chrome return, browser-local file import,
OPFS persistence or owner acceptance; all those fields stay `NOT_TESTED`.
Do not feed it to `acceptRemoteAcquisition` as though a worker issued it.

## Product risks and next gates

R4/R5: one-time setup plus an app switch is a material UX trade-off. This is preferable
as a feasibility test to paying for an unqualified service, but it has NOT yet met the
premium product flow. Do not ship terminal setup as the user-facing finished downloader.

R9/R11: native preflight, actual source bytes, browser handoff, playback, persistence
and owner acceptance are independent gates. Desktop or emulated mobile screenshots
cannot certify the iPhone. Existing source-region/bot restrictions still apply.

R12: reuse the canonical planner and byte verifier. New local provenance must stay
separate from the remote receipt protocol; the browser's MediaPackage remains product canon.

R14: URLs/format IDs cannot become arbitrary shell text, output paths or executable
flags. The current return action only allows a fixed HTTPS-equivalent Chrome origin
and a 32-character random hex identifier. a-Shell logs launched command URLs, so future
launch payloads must never contain session tokens or signed source media URLs.

R15/R16: no media-server bytes or cloud ASR in the runner. 300 MiB output/3-hour source
limits are reused. Partial/multiple tracks can consume more local disk; the download
progress guard is 600 MiB before verification, and a remux may temporarily add another
300 MiB. The 30-minute download limit is cooperative, not a hard watchdog for native
JS deadlock. Results remain in the selected owner-test folder; no automatic purge of
owner media. Background operation/lockscreen/relaunch resume are not qualified.

Next, in order:

1. Owner agrees to install a-Shell mini and runs native preflight on the actual iPhone.
2. Actual permitted audio + video source downloads; verify report and device playback.
3. Owner requests Chrome return, selects file through existing device importer, checks
   app/session continuity and repeated reopen. No ASR charge required for this gate.
4. Only after the route works: implement Chrome launch, metadata/options return, explicit
   safe file binding, local provenance, interruption/cancel/recovery and export receipts
   in the existing Studio UI. Avoid a background localhost bridge on suspended iOS.
5. RU/EN/HE, 380px/RTL, accessibility, actual Chrome/iPhone end-to-end acceptance;
   isolate and resolve the pre-existing feature-branch `smoke:studio-chunks` qualification
   ambiguity before any production merge. Production changes require their own gates.

## Primary references checked 2026-09-08

- [a-Shell mini App Store listing](https://apps.apple.com/us/app/a-shell-mini/id1543537943):
  free, iPhone support, Python and native FFmpeg.
- [a-Shell README](https://github.com/holzschu/a-shell): sandbox, `pickFolder`, Shortcuts.
- [a-Shell mini URL scheme declarations](https://github.com/holzschu/a-shell/blob/master/a-Shell-mini-Info.plist)
  and [URL command handling](https://github.com/holzschu/a-shell/blob/master/a-Shell/SceneDelegate.swift).
- [Chrome iOS URL schemes](https://github.com/chromium/chromium/blob/main/docs/ios/opening_links.md):
  HTTPS uses `googlechromes:` and opens a new tab; not automatic file delivery.
- [yt-dlp EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS) and
  [Apple WebKit provider v0.1.1](https://github.com/grqz/yt-dlp-apple-webkit-jsi/tree/v0.1.1):
  current challenge-runtime boundary and native platform requirement.
