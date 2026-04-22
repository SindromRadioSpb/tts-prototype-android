# TTS Provider Policy

Дата: 2026-04-22

## Provider List

| Provider ID | Label | Scope |
|---|---|---|
| `online_tts` | `Online TTS` | default cloud path |
| `hebrew_phonikud_piper` | `Hebrew Local Piper` | Hebrew local sidecar |
| `local_neural_tts_piper` | `Local Piper / Web WASM` | browser `web_wasm` path |
| `system_fallback` | `Browser fallback` | `speechSynthesis` emergency path |

## Language Routing

| Language | Preferred local option | Fallback |
|---|---|---|
| `he` | `hebrew_phonikud_piper` when enabled and license allows | `online_tts -> system_fallback` |
| `en` | `local_neural_tts_piper` | `online_tts -> system_fallback` |
| `ru` | none | `online_tts -> system_fallback` |

## Hebrew Local Gates

Browser-side config and server-side routing depend on:

```text
TTS_HEBREW_LOCAL_EXPERIMENTAL=true
TTS_HEBREW_LOCAL_LICENSE_MODE=noncommercial
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

## Current Rule

Hebrew Local Piper is integrated for noncommercial use in this project configuration.
