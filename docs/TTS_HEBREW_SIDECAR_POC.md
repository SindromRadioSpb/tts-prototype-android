# TTS Hebrew Sidecar PoC

Дата: 2026-04-22

## Endpoint

`POST /tts/hebrew/phonikud-piper`

## File

[ai-local/hebrew_tts_sidecar.py](/E:/projects/tts-prototype-android/ai-local/hebrew_tts_sidecar.py)

## Behavior

- feature-flagged by `TTS_HEBREW_LOCAL_EXPERIMENTAL`
- returns `503` when the experiment is disabled
- trims and clamps text to `MAX_TEXT_CHARS`
- synthesizes WAV via `PhonikudPiperPocEngine`
- returns `audio/wav`
- exposes diagnostics in `X-TTS-Diagnostics` response header

## Diagnostics Header

`X-TTS-Diagnostics` contains JSON with:

- `provider`
- `runtime`
- `voice`
- `g2pMs`
- `ttsMs`
- `totalMs`
- `textChars`
- `licenseStatus`
- `qualityTier`

## Why This Path Exists

- it is isolated from the main Node UI/runtime
- it matches the only realistic near-term Hebrew local TTS path found in this spike
- it does not alter the product default provider for Hebrew

## Limitations

- research-only due license
- no auth, no rate limiting, no packaging story
- manual listening review still pending
