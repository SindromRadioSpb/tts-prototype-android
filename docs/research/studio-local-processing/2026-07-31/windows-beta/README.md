# Windows Local ASR invite-only beta enablement evidence

The local engineering slice is `PASS`; external beta distribution is `NO-GO` until signing,
license review, owner acceptance, and a separate push/deploy/distribution decision.

The Companion is a per-user Windows installer with a loopback-only supervisor, session pairing,
explicit exact-pin model installation, GPU/CUDA/runtime/disk/port preflight, model/job deletion
receipts, and redacted diagnostics. The product surface is protected by a server runtime flag
that defaults off plus explicit browser enrollment; Gemini remains the default and no Local error
can invoke it automatically.

## Measured result

- Installer: 1,766,465,078 bytes; SHA-256
  `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`.
- Signature: `NotSigned`; internal testing only.
- Provenance: built from the scoped dirty worktree at HEAD `77c48d139…`; rebuild from the final
  clean commit is mandatory before any signing or distribution decision.
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
effects when combined with the separate 1.62 GB model. Any distribution decision must accept or
redesign that tradeoff explicitly.

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
local product server and never contacts Gemini. Production-origin browser verification remains
`NOT_RUN` because push/deploy were explicitly outside this slice.

## Files

- `evidence-report.json` — authoritative machine-readable closure.
- `browser-matrix-report.json` and four PNGs — system Chrome/Edge LTR/RTL evidence.
- `run_onboarding_matrix.js` — reproducible local-origin runner.
- `OWNER_BLINDED_LISTEN_READ_WORKSHEET.md` — owner scoring form.
- `OWNER_BLINDED_KEY.private-template.md` — separate unfilled mapping template.
- `beta-acceptance-manifest.template.json` — frozen-set constraints; currently blocked.
