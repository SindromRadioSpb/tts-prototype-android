# Windows Local ASR invite-only beta enablement evidence

The local engineering slice is `PASS`. The owner has authorized this exact unsigned artifact for
out-of-band use by the owner and personally trusted beta users. Public hosting/general distribution,
and permanent integration remain separately gated. The Chrome-only production onboarding and
pairing help are now deployed at `v3.11.277`; this does not authorize public installer hosting.

The Companion is a per-user Windows installer with a loopback-only supervisor, session pairing,
explicit exact-pin model installation, GPU/CUDA/runtime/disk/port preflight, model/job deletion
receipts, and redacted diagnostics. The product surface is protected by a server runtime flag
that defaults off plus explicit browser enrollment; Gemini remains the default and no Local error
can invoke it automatically.

## Measured result

- Current installer beta.2: 1,766,474,350 bytes; SHA-256
  `32ac13e03417c358dfcc04f10a50132fd9c7ad7f308076b6f75d82661f68c7ba`.
- Signature: `NotSigned`; owner-approved trusted-cohort beta only, with a visible unsigned warning.
- Provenance: built from the scoped dirty worktree at HEAD `77c48d139…`; a rebuild from the final
  clean commit remains required for any future signed/public artifact.
- Self-contained runtime: FFmpeg/ffprobe 8.1, pinned cuDNN 9.10.2.21 and cuBLAS 12.1.3.1.
- Separate model: 1,621,665,181 runtime bytes; exact revision and every runtime hash verified.
- Frozen install/live-update with owned stop and restart/start/restart/decode/delete/uninstall:
  PASS. Real CUDA job reached
  `COMPLETE` in 7.23 seconds; no transcript content is recorded here.
- Chrome 150 and Edge 150 system binaries: PASS at 380×844 in LTR and RTL from the local product
  origin; explicit Local selected; Gemini requests observed: zero.
- Cleanup: program tree, model, jobs, pairing/state, diagnostics, and listener all absent after
  uninstall.

The 1.77 GB installer is a material beta finding. It avoids asking users to install CUDA runtime
DLLs manually, but makes the total initial transfer roughly 3.39 GB before compression/HTTP
effects when combined with the separate 1.62 GB model. The owner accepted this tradeoff for the
bounded noncommercial trusted cohort.

Beta.2 makes pairing discoverable: the Companion has a dedicated **Connect LinguistPro in Chrome**
section with **Copy token for browser**, plus **Help / Справка** and a Start-menu guide shortcut.
The same canonical RU/EN/HE Markdown guides are bundled in the installer and allowlisted by the web
server. An in-place update preserved the pinned model and two completed jobs; beta.2 frozen
start/health/stop passed. A supervisor-compatible but unowned listener is no longer accepted as an
owned `RUNNING` service.

## Reproduce

```powershell
& .\ai-local\scripts\build_companion.ps1
ai-local\.venv\Scripts\python.exe -m pytest ai-local\tests -q
node tests\localAsrClient.test.js
node tests\localAsrStudioAdapter.test.js
npm run smoke:i18n
npm run test:api-smoke
node docs\research\studio-local-processing\2026-07-31\windows-beta\run_onboarding_matrix.js
```

The browser runner requires the installed Companion to be running and paired. It starts only a
local product server and never contacts Gemini. The owner authorized a production-origin ceremony
on 2026-07-31; it remains distinct from push/deploy authorization.

On the owner's trusted Windows machine the exact artifact hash was verified before installation,
the Companion is currently running on `127.0.0.1:8799`, the exact model revision/hash is activated,
and the production-origin authenticated API preflight is `PASS 9/9`. The Chrome UI step is
complete on the actually served `v3.11.272`: the owner set the existing browser-local experimental
flag, Gemini remained the reset/default provider, Local was selected explicitly, and the UI rendered
`Local companion ready; pinned model verified` for revision `72ad623a3794`. The visible password
field and both browser/system clipboards were cleared after pairing; no pairing secret was written
to evidence. A 30:05.82 owner-selected MP3 then completed locally in 66.54 seconds of model time
(`RTF 0.03685`), `3/3` chunks, with S12.5/S12.6/S12.7 all PASS and no warnings/OOM. The native
Chrome file chooser could not be automated through the extension, so that first job used the same
loopback API with the production Origin header. The owner then completed the native Chrome flow,
explicitly ran Local, saved the resulting Library card, and exported it. The UI job completed in
71.987 seconds wall time (`model RTF 0.03446`) and preserved all 503 ASR segments into 552 timed rows.
See `LONG_RUN_MIA_PRODUCTION_ORIGIN_REPORT.md` and `MIA_LOCAL_VS_GEMINI_COMPARISON.md`. The Edge
production-origin ceremony is not required because Edge is excluded from the first beta.

The normal non-DevTools onboarding is deployed on production as `v3.11.276` from commit
`d445c7e89c85dcc889b973f838870bb0d13a3ba4`. The runtime gate is on, while enrollment remains an
explicit per-browser invite action; Gemini remains the default. Cache-busted client config and
health checks passed, the advertised matrix is Chrome only, and no installer URL is publicly
exposed. Production Chrome rendered the full Companion/pairing/preflight/model/warmup/explicit-
Local flow. Narrow LTR and RTL measurements had no page, dialog, or child horizontal overflow.
No schema or production-data mutation occurred.

The corresponding web pairing explanation and locale-aware guide link are deployed from commit
`381233e04c017246d9dbf106581983ad9f3b618e` as `v3.11.277`. Cache-busted client config, SW,
RU/EN/HE guide routes, health, DB and migrations passed. Served mobile measurements at 380x844
showed `365 == 365` page width and `348 == 348` dialog width in RU/LTR and HE/RTL; Gemini remained
the import provider default. Native Chrome control timed out on its invite confirm dialog, so this
was not claimed as an automated PASS. The owner subsequently completed that exact manual ceremony
successfully; see the closure below.

The owner authorized bounded cleanup. Before deploy, unused builder cache plus two exact oldest
unreferenced LinguistPro images reduced the host from 90%/3.7 GB free to 77%/8.4 GB free while
retaining the active image and two recent rollbacks. After deploy, another unused-cache prune and
one exact oldest unreferenced image left the host at 78% with 8.0 GB free. All ten containers and
all three active volumes were preserved; production data and schema were untouched.

Owner decision on 2026-07-31 makes the ten Mia listen/read checkpoints, the four-speaker beta
human-gold study, and the former 60-minute/12-speaker permanent study recommended rather than
mandatory. They remain useful evidence and are not claimed PASS. Permanent integration itself
remains unauthorized pending a separate owner decision.

## Owner Chrome closure and local `v3.11.279` follow-up

The owner completed the final native Chrome `v3.11.277` pairing-help ceremony successfully.
Owner-only dogfood remains in progress and is explicitly non-blocking. Trusted-user expansion is
optional and demand-driven.

Local candidate `3.11.279` (`1046686694f76afdb4d53fa0766274d98607ca3a`, building on
`0bdf4529`) closes the remaining connection-feedback gap. Successful checks change the proximal
action to **Подключено / Connected / מחובר** in both Experimental Local ASR and Import → File →
Local. In the import dialog, the companion/model result now appears immediately below the
`127.0.0.1` privacy hint in the Local setup block; pairing errors use the same region, and the
modal-wide footer remains reserved for import/job status. Editing the token or a failed check
clears the success state. Real-Companion checks passed on both surfaces at 380×844 in RU/LTR and
HE/RTL without horizontal overflow; the global import status remained empty and Gemini requests
were zero. Focused Node tests passed `21/21`, i18n `233/233`, API and ingest smoke passed. The
candidate is not pushed or deployed.

L2 is recorded as `DEFERRED / DEMAND-TRIGGERED`: single-job browser recovery returns on real
reload/job-loss friction; batch/queue returns on demonstrated recurring 3–5+ file demand. This is
neither a completed nor cancelled slice.

## Files

- `evidence-report.json` — authoritative machine-readable closure.
- `browser-matrix-report.json` and four PNGs — system Chrome/Edge LTR/RTL evidence.
- `LONG_RUN_MIA_PRODUCTION_ORIGIN_REPORT.md` — 30-minute real-media run and bounded card comparison.
- `MIA_LOCAL_VS_GEMINI_COMPARISON.md` — exact UI-export provenance, offline disagreement metrics,
  quality findings, and owner listen/read checkpoints.
- `run_onboarding_matrix.js` — reproducible local-origin runner.
- `OWNER_BLINDED_LISTEN_READ_WORKSHEET.md` — owner scoring form.
- `OWNER_BLINDED_KEY.private-template.md` — separate unfilled mapping template.
- `beta-acceptance-manifest.template.json` — frozen-set constraints; currently blocked.
