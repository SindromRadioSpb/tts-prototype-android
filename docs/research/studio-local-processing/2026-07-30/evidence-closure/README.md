# L1 evidence-closure hardening

Bounded owner-approved slice: frozen sidecar batch-20, real browser compatibility evidence,
and the B+C integrity/export-import fixes inside the existing default-off adapter. It does not
authorize permanent integration, provider/default changes, cloud spend, production work, or a
new expanded human-gold corpus.

The batch runner has a mandatory two-step boundary. `--freeze` records hashes of the existing L0
selection before inference; `--run` refuses any later gold/audio/model mismatch. Raw owner media,
raw transcripts, tokens, and sidecar job state remain local and are deleted by lifecycle calls.

## Result

- batch-20: 20/20 terminal, WER `0.025974`, CER `0.009259`, no retry/fallback;
- Chrome `150.0.7871.187` and Edge `150.0.4078.105`: installed system binaries PASS;
- Firefox engine: Mozilla Playwright build `146.0.1` PASS; installed stock Firefox 153 rejects
  Juggler automation and is not falsely reported as tested;
- 380×844, RTL, default-off, explicit enable/pairing, PNA handshake, upload/start,
  queue/progress, retry/cancel/delete and sidecar-down PASS;
- Gemini/cloud requests: zero;
- B+C round-trip smoke: 35/35; focused Node suites: 46/46; `ai-local` pytest: 41/41;
- temporary jobs, model activation, media, browser state and local processes deleted; see
  [`cleanup-receipts.json`](cleanup-receipts.json).

Browser evidence is split intentionally. `http://192.168.1.228:3000` proves LAN-origin to
loopback capability/PNA behavior, but plain LAN HTTP is not a trustworthy context for WebCrypto.
Full media hashing/upload/inference therefore runs from `http://127.0.0.1:3000`. Firefox emits
report-only CSP `connect-src 'self'` warnings while allowing the requests.

## Stable artifacts

- [`sidecar-batch20-frozen-inputs.json`](sidecar-batch20-frozen-inputs.json) — manifest frozen
  before inference; no transcript text;
- [`sidecar-batch20-report.json`](sidecar-batch20-report.json) — per-item and aggregate metrics,
  model/code/runtime provenance, telemetry and 20 deletion receipts;
- [`browser-matrix-live.json`](browser-matrix-live.json) and
  [`browser-matrix-sidecar-down.json`](browser-matrix-sidecar-down.json) — scenario-level evidence;
- `*-default-off-380x844.png`, `*-local-complete-rtl-380x844.png` — screenshots;
- [`OWNER_ACCEPTANCE_WORKSHEET.md`](OWNER_ACCEPTANCE_WORKSHEET.md) — next owner decision, not an
  integration authorization.

```powershell
ai-local\.venv\Scripts\python.exe docs\research\studio-local-processing\2026-07-30\evidence-closure\run_sidecar_batch20.py --freeze
# Start the explicitly enabled loopback sidecar with a temporary token, then:
ai-local\.venv\Scripts\python.exe docs\research\studio-local-processing\2026-07-30\evidence-closure\run_sidecar_batch20.py --run --token-file <temporary-token-file>
```

The browser runner requires an explicitly started local dev server and the explicitly enabled,
paired sidecar. It never provisions credentials or calls Gemini:

```powershell
node docs\research\studio-local-processing\2026-07-30\evidence-closure\run_browser_matrix.js --mode live
# Stop the sidecar, then prove the no-fallback state:
node docs\research\studio-local-processing\2026-07-30\evidence-closure\run_browser_matrix.js --mode down
```
