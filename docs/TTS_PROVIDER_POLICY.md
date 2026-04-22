# TTS Provider Policy

Дата: 2026-04-22

## Provider List

| Provider ID | Label | Scope |
|---|---|---|
| `online_tts` | `Online TTS` | default cloud path |
| `hebrew_phonikud_piper` | `Hebrew Local Piper` | disabled product path, kept in code |
| `local_neural_tts_piper` | `Local Piper / Web WASM` | disabled product path, kept in code |
| `system_fallback` | `Browser fallback` | low-quality `speechSynthesis` emergency path |

## Language Routing

| Language | Preferred local option | Fallback |
|---|---|---|
| `he` | none | `online_tts -> system_fallback` |
| `en` | none | `online_tts -> system_fallback` |
| `ru` | none | `online_tts -> system_fallback` |

## Hebrew Local Gates

Product defaults keep local providers disabled:

```text
TTS_HEBREW_LOCAL_EXPERIMENTAL=false
TTS_HEBREW_LOCAL_LICENSE_MODE=research_only
TTS_WEB_WASM_ENABLED=false
```

Allowed Hebrew local license modes:

- `research_only`
- `noncommercial`

Blocked Hebrew local license modes:

- `commercial`
- `premium_commercial`

## Persistence

The UI persists:

```text
tts.selectedProvider
tts.voice.online_tts
tts.voice.hebrew_phonikud_piper
tts.voice.local_neural_tts_piper
tts.speed
tts.pitch
```

Legacy flat voice settings are migrated into the new structure without resetting user preferences.

## Diagnostics

Diagnostics now show:

- `selectedProvider`
- `actualProvider`
- `fallbackChain`
- `fallbackReason`
- Hebrew sidecar `licenseMode`
- `speedSupported`
- `pitchSupported`

## Online TTS Credentials

`Online TTS` now has the same dashboard UX pattern as GCP Translate:

- `🔑` button to upload a service account JSON from the user device
- `🔑 загружен` / `🔑 из .env` badge near the main TTS controls
- right-click on the button or badge removes the uploaded key and falls back to `.env` if present

## Current Rule

`Online TTS` is the default provider for all product languages. `Browser fallback` remains available only as an emergency, significantly lower-quality speech path.
