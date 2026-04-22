# TTS Provider Policy

Дата: 2026-04-22

## Current Policy

- Hebrew: online TTS is the default
- English: local `web_wasm` Piper remains enabled
- Browser `speechSynthesis`: explicit fallback only
- Hebrew local Phonikud/Piper: experimental, research-only, disabled by default

## Flags

Browser-side config:

- `TTS_HEBREW_LOCAL_EXPERIMENTAL=false`

## Effective Routing

| Language | Default path | Local experimental path |
|---|---|---|
| `he` | online `/api/tts` | only if `TTS_HEBREW_LOCAL_EXPERIMENTAL=true` |
| `en` | local `web_wasm` | yes |
| `ru` | online `/api/tts` | no default local path |

## Rationale

1. Hebrew local voice assets are not commercial-safe in the current spike.
2. Hebrew browser `web_wasm` runtime is not proven.
3. Product requirement is that Hebrew TTS must keep working for the user.

## UI Impact

- main Hebrew playback no longer gets intercepted by local portable TTS by default
- badge/diagnostics explicitly show online default for Hebrew when the local experiment is off
