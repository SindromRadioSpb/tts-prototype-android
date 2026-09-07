# Built-in media downloader — implementation and acceptance

Date: 2026-09-08. Source baseline: `f9b8eb954d22c3c53f13e88e3e988045b3201320`.
Status: implemented and locally verified; production activation BLOCKED. No physical-device acceptance claim.
Generated from the owner's five-step approval, current source inspection, and bounded source probes.
Review this document and the scoped source diff. Temporary media and local test profiles are scratch.

## Approved result

Add Material → By link → source title/duration/options → Video or Audio only and quality →
Add to LinguistPro → progress → local playback, transcription, or Save file to device.
The owner explicitly replaces Downr as the primary experience. This supersedes the 2026-08-11
external-handoff UI decision. Existing source/caption/file import and MediaPackage remain canonical.
YouTube is the first supported link provider; arbitrary webpage/direct-file fetching is not silently
added to the YouTube security boundary. No automatic ASR, provider-key use, account cookies, paid
infrastructure purchase, or home-PC relay follows from this implementation approval.

## Evidence and architecture

The existing production worker is running (`fd496fb4`). On 2026-09-08 the owner's example returned
`Video unavailable` there, while the local pinned runtime resolved 1080 seconds and 16 formats.
This is metadata evidence, not successful media acquisition. A new UI cannot repair this route.
Reuse the isolated worker, signed user capabilities, immutable format plan, verified local media,
and existing Studio attachment. Add bounded HTTP Range resume and durable browser checkpoints.
Keep file-system save completion distinct from a browser download/share request.

## Role review and visual plan

- R4/R5: a single source card, visible Video/Audio choice, quality as a secondary select;
  post-download playback and export immediately available. Keep preview independent of extraction.
- R9/R11: actual-byte hash and codec evidence precede readiness; source metadata is not proof of
  file availability; a started browser download is not an independently confirmed saved copy.
- R12/R14: no media proxy in Node or media in the product database; exact owner binding,
  idempotent creation, no secret in browser persistence, bounded queue/stream retries.
- R15/R16: temporary preparation, two-hour expiry, cancellation cleanup, 300 MiB and three-hour
  source ceilings; no unapproved egress provider or spending.

Use Studio's current theme variables (card white #ffffff, text #212529, muted #6c757d,
accent teal #0b7673, border #dee2e6, danger #b64637; dark mode uses existing theme overrides),
inherited typeface, start alignment and RTL logical spacing. Source title leads; native controls
use at least 44px targets. No separate dashboard or decorative step rail.

## Scoped changes

`media-acquisition/acquisition_service/**`, its tests, `public/js/remote-media-acquisition.js`,
`public/js/media-stream-store.js`, narrow `studio-import.js` hooks, `public/index.html`, the three
locales, shell/SW/integrity/version files as required, targeted media tests/browser harness,
and this implementation/evidence packet. Preserve unrelated dirty files and owner learner data.

## Verification and release gates

1. Red/green tests: range/ETag/ownership, idempotent job and receipt, classified provider failure,
   interrupted local write/resume, changed source, corrupt bytes, cancellation, honest export.
2. Real prepared audio and video with codec/duration/hash verification. Record the environment;
   desktop/local success does not qualify the production route.
3. Actual browser HTTP/OPFS transfer, reload/close/reopen, playback and export; 380px RU/HE and desktop.
4. Required repository checks and allowlisted commit. No production enablement before actual
   acquisition succeeds on its serving route. Any new infrastructure decision must specify the
   target and budget; do all implementation/verification possible before escalating that boundary.
5. Physical iPhone and Android acceptance remains separate from automated browser evidence.

## Results

### Implementation

The five-step flow is implemented in the existing composer. It provides title/duration,
video/audio selection, quality, explicit rights confirmation, preparation/device progress,
pause/resume/cancel, local playback, explicit transcription setup, device export, and local
download history. The frontend-design skill was applied through existing Studio theme tokens,
compact composition, 44px controls, and RU/HE 380px visual review; no new dashboard was added.
The older YouTube player/caption path remains independently accessible in a secondary disclosure.

Worker 0.2.0 pins yt-dlp 2026.8.19 and yt-dlp-ejs 0.8.0 in a hashed dependency lock. Actual
H264/AAC, 8-bit 4:2:0, expected height/duration, and a successful faststart remux precede
readiness. Job creation and device acknowledgements are idempotent. Stream retries require
the exact immutable hash/ETag; ready outputs and completed receipts recover from signed
temporary manifests. Browser capabilities are never persisted. OPFS commits resumable
prefixes, re-hashes them, verifies the entire file, and only then exposes a completed copy.

Release candidate shell/SW is 3.11.489; locales 208 and integrity paths are synchronized.
This is a candidate version, not a statement about the deployed application.

### Actual source evidence

Owner example: YouTube video ID `dH_OkB7Uym4`, duration 1080.16907 seconds.
On the local Windows route, final-code probes succeeded:

| Selection | Bytes | SHA-256 | Verification |
| --- | ---: | --- | --- |
| MP4 360p | 39,266,303 | `8c29ffc99bc0fb0aaae72957b0e0697b2a4dd11f4de7b335ab229395994161e9` | H264 Main, yuv420p, AAC, faststart |
| M4A | 17,469,873 | `dd9825be1b5e3a74a875120ef839a6e5c58b791b1d3d2b04814e6ac5edab487d` | AAC, no video, faststart |

Final probes took 6.69s and 5.8s respectively. Both temporary output directories were removed.
These times describe this route/run, not a performance guarantee.

The current production worker and an isolated throwaway container on the same server with the
updated engine both returned source unavailability. No successful production media bytes were
obtained. Observed unavailability does not establish whether geo, IP reputation, or another
upstream restriction caused it. An engine upgrade alone did not qualify the current route.
The diagnostic container was removed; the production app/worker were not replaced or restarted.

### Verification

- `npm test`: **1370/1370 PASS**.
- Worker Python tests: **28/28 PASS**, including wrong-owner reads, Range/ETag mismatch,
  duplicate creation/ack, restart recovery, manifest tamper and cancellation during hashing.
- Focused JavaScript tests: **13/13 PASS** (included in the full suite).
- Real browser test: **28/28 PASS**, including same-job nonzero HTTP Range after pause/reload,
  decoded video/audio, offline reopening, exported-file SHA parity, truthful save receipts,
  local-copy recovery when the server receipt is unavailable (cleanup remains unconfirmed),
  explicit transcription setup without automatic ASR, failed-source stale-choice removal,
  no page errors, 44px actions, 380px RU/HE RTL and desktop layout.
- API smoke, ingest smoke (22 cases), captions parser smoke and i18n (233 checks): **PASS**.
- `smoke:studio-chunks`: **NOT GREEN**. Current shell twice timed out at scenario 7
  (`calls=4, entries=0, drop=null, err=""`). A read-only baseline-asset comparison using
  `f9b8eb95` also failed twice, earlier at scenario 3 (missing repair provenance). This does
  not prove the scenario-7 cause or qualify the long-transcript suite. No unrelated ASR/table
  logic was changed to force the gate green. Resolve this separate regression-gate ambiguity
  before a production merge; do not report it as fully verified.

See [browser evidence and reproduction](../research/studio-media-downloader/2026-09-08/README.md).
Generated media/auth are fixtures only in automated browser tests; the actual source probes above
are separate evidence. Physical iPhone/Android, OS save-picker completion, and paid-provider ASR
were not exercised. Local media belongs to the browser profile, not a server account partition.

### Deployment boundary

Do not push this candidate to a production-triggering `main` or activate its new UI against
the unqualified route. Retain it on a scoped feature branch. Required next owner decision:
an approved server-side acquisition service/egress target and spending ceiling, followed by
actual-byte checks on that serving route and the existing reliability gate. A random new VPS,
account cookies, DRM/login bypass, or a home-PC relay is not an approved solution. After route
qualification, deploy the worker and app capability contract together, rerun browser gates,
then request separate physical-device acceptance.
