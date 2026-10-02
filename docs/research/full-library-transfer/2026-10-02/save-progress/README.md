# One-operation library save — 3.11.722

## Owner path and contract

The existing owner save was in progress with a disabled Save button and only a bottom status saying Preparing files 42%. No progress bar existed. A temporary sticky bar with a correct Saving to disk label was added without restarting the running write. Later the export dialog was closed; no assumption about its final filesystem location is made.

- Settings have one Save archive action. The native file chooser runs first, within the click gesture. Preparation and write then proceed automatically with one operation and one cancellation control. No second Save click or File saved confirmation.
- Waiting is visible before metadata capture begins. Preparation shows the current material/workspace/audio/text stage and counts; large media hashing reports byte progress. Write shows actual committed bytes and percentage. Close has a separate finishing label; success is shown only after close succeeds.
- SHA/CRC are computed during preparation. The writer reuses prepared CRCs and checks payload SHA/CRC during copying; it no longer rereads every prepared payload before writing. Legacy callers without CRC keep their safe preflight.
- Small ZIP headers and speech files are coalesced into writes of at most 4 MiB. ZIP64, bounded media memory, cancellation/abort and changed-source rejection remain enforced.
- Successful native FileSystemWritable.close automatically records the canonical saved receipt. No manual confirmation button exists. Ordinary browser-download fallback reports download started, does not claim proven disk completion, and does not request manual confirmation.

## Evidence

19 tests passed: transport/integrity/cancellation, 1,500 MP3 payloads with exactly one source read each and one bounded write, changed-source abort with prepared CRC, shell parity.

Clean-profile browser gate passed: one click, one chooser; visible preparation/write/closing bars; no saved receipt before close; automatic receipt and success afterward; no manual confirmation button. Stalled-stage screenshots inspected. Existing private/foreign restore, optional media/MP3, offline real audio/video playback and no-write rejection remain PASS. No paid calls.

Initial 3.11.721 release deployed as `92c815c5`, queue 2594 finished 20:07:58 UTC; final 3.11.722 also ensures the paint wait never stalls background tabs. The browser gate simulates a hidden document during initial save and verifies preparation still starts. Hidden-document save gate PASS. Final production PASS: `9d1d11e7064e56f1fd59c281ef363cd5e174f38b`, queue 2595 finished 20:19:59 UTC. Three no-cache exact asset/version/health checks and the full production browser gate passed. The idle owner tab received the same three updated modules without reload or another save operation; its page shell remains 3.11.720, while transfer functionality is 3.11.722. Native save API is available. See `production/served-assets.json` and `production/browser-evidence.json`.

Post-deploy approved cleanup removed only unreferenced prior runtime images and unused build cache after each completed release. The current runtime, all 12 running containers and all 4 data volumes were preserved. Final disk 4.4G free (88%), zero build cache, DB/migrations ready. See `production/cleanup-721.json` and `production/cleanup-722.json`.

## Platform boundary

Without the FileSystem Access API, a page cannot observe the completion of a browser-managed download. The staging file is retained to avoid deleting a source while a download is active. This fallback needs a separate safe retention policy; native desktop Chrome does not use staging.
