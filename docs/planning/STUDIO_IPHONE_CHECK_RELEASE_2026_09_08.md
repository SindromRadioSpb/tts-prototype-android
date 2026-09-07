# iPhone + Chrome qualification page: production release

Date: 2026-09-08. Owner approved a-Shell mini installation and explicitly requested
production publication plus test instructions. **Scope is the qualification route,
not an assertion that local YouTube downloading already works on the owner's iPhone.**

## Isolation and source

Release starts at live/main `f9b8eb954d22c3c53f13e88e3e988045b3201320` (3.11.488),
in isolated branch `release/iphone-media-check-2026-09-08`.
The unrelated server-downloader feature branch is NOT merged. Worker image, source
route, Studio importer, captions/ASR and data schemas are unchanged. Main shell changes
are only synchronized version stamps, 3.11.490 (3.11.489 is an unreleased server candidate).

Published entry: `/iphone-media-check.html`, separate from navigation and marked noindex.
This is a public, unindexed instruction page, **not an authentication-protected owner API**.
It contains no private user data, credentials or privileged server operation.

The ZIP is an immutable generated artifact from feature commit `78dd8996`; its internal
manifest cites engine baseline `c992300d` and exact bundled file hashes. SHA-256:
`0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282` (24,165 bytes).
It is served as `/downloads/linguistpro-iphone-probe-0744253a.zip`.
Source/build scripts remain on the feature branch; no manual fork of those engine sources
is introduced into production code. The archive must not be edited/rebuilt from older
main worker sources. Generate a new version from the reviewed feature source instead.

## User experience and role review

R4/R5: a dedicated, Russian-language owner test guide; not a new general UI surface.
The original five-step in-product downloader remains unqualified locally. Commands and
manual import are explicitly a temporary verification procedure, not finished premium UX.
R9/R11: `REQUESTED`, native preflight, bytes, file import and actual iPhone acceptance
remain distinct. No emulated device is certified as a physical iPhone.
R12: no new product data store or remote receipt. The selected file returns through the
existing device importer. R14: source/rights/job inputs are reduced to allowlisted tokens
before creating commands; no arbitrary command, path or callback origin. R15/R16: no
media-server request, personal-data persistence or automatic ASR from the check page.

The frontend-design skill informed reuse of existing LinguistPro tokens and a single
left-aligned sequence: page #f4f6f9, card #ffffff, text #0f172a/#475569, accent #2563eb,
warning #fffbeb. Existing system UI font; monospace only for copyable commands. No hero
image, decorative dashboard cards or animation. 44px controls, readable 380px layout and
dark mode. Browser review caught body-level theme aliases; corrected locally without
changing shared foundations.

## Verification and release gates

- New deterministic tests: 5/5 PASS (URL/rights/command safety, archive hash, explicit scope).
- Full Node suite: 1371/1371 PASS. Two initial failures were stale 3.11.488 assertions,
  synchronized to 3.11.490; no assertions weakened and no runtime regression hidden.
- API smoke: PASS; ingest smoke: 22/22 PASS.
- Isolated browser: actual ZIP download hash, real clipboard write, invalid input clears
  old commands, no stored rights, two reloads, 380px/desktop/dark layout, 44px controls,
  zero page errors and zero API/provider calls.
- Screenshots and browser reports: `docs/research/studio-iphone-local-media/2026-09-08/`.
- Native helper, actual iPhone source download, iOS file picker and playback: OWNER TEST
  PENDING. Not required to publish a clearly labeled diagnostic package; required before
  promoting the acquisition route to normal product navigation.

Chrome DevTools MCP could not acquire its already-used profile. Troubleshooting was
read-only; no user browser was stopped and no global configuration was changed. Existing
Playwright supplied isolated browser QA. Test-generated unrelated corpus artifacts in
the disposable checkout are excluded from the commit allowlist.

Pre-push: inspect exact diff from `origin/main`, stage only page/assets/archive/version
locks/tests/harness/these release docs and screenshots, ensure main has not advanced.
Then regular fast-forward push to main; no forced push. After webhook deployment:
verify running image commit, /healthz, client-config 3.11.490, page/CSS/JS hashes, ZIP SHA,
two fresh/reload browser passes, existing Studio and Room availability. Worker stays put.
Rollback is a scoped revert of this release if necessary; do not delete owner data or images.
