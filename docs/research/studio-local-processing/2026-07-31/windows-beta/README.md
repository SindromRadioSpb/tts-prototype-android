# Windows Local ASR invite-only beta enablement evidence

The local engineering slice is `PASS`. The owner has authorized this exact unsigned artifact for
out-of-band use by the owner and personally trusted beta users. Public hosting/general distribution,
push/deploy, and permanent integration remain separately gated.

The Companion is a per-user Windows installer with a loopback-only supervisor, session pairing,
explicit exact-pin model installation, GPU/CUDA/runtime/disk/port preflight, model/job deletion
receipts, and redacted diagnostics. The product surface is protected by a server runtime flag
that defaults off plus explicit browser enrollment; Gemini remains the default and no Local error
can invoke it automatically.

## Measured result

- Installer: 1,766,465,078 bytes; SHA-256
  `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`.
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
Chrome file chooser was not exercised: after Chrome-extension upload failed, the job used the same
loopback API with the production Origin header. See `LONG_RUN_MIA_PRODUCTION_ORIGIN_REPORT.md`.
The Edge production-origin ceremony and deployment of the new `v3.11.273` onboarding UI remain open.

## Files

- `evidence-report.json` — authoritative machine-readable closure.
- `browser-matrix-report.json` and four PNGs — system Chrome/Edge LTR/RTL evidence.
- `LONG_RUN_MIA_PRODUCTION_ORIGIN_REPORT.md` — 30-minute real-media run and bounded card comparison.
- `run_onboarding_matrix.js` — reproducible local-origin runner.
- `OWNER_BLINDED_LISTEN_READ_WORKSHEET.md` — owner scoring form.
- `OWNER_BLINDED_KEY.private-template.md` — separate unfilled mapping template.
- `beta-acceptance-manifest.template.json` — frozen-set constraints; currently blocked.
