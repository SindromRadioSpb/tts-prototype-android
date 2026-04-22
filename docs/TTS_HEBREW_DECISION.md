# TTS Hebrew Decision

Дата: 2026-04-22

## Decision

`DECISION_F_INTEGRATE_NONCOMMERCIAL_HEBREW_SIDECAR`

## Why

- Manual Hebrew TTS quality review passed.
- The product is noncommercial.
- Commercial and premium-commercial usage remain blocked until separate licensing is obtained.

## Product Rule

Hebrew TTS must remain usable for the user at all times.

Implemented provider chain:

```text
hebrew_phonikud_piper
  -> online_tts
  -> system_fallback
  -> unavailable
```

## What Changed

- Hebrew Phonikud/Piper is now integrated as a selectable provider in the main TTS settings UI.
- The selected provider, per-provider voice, speed and pitch are persisted.
- Hebrew sidecar health and diagnostics are exposed in UI.
- Online TTS remains available and acts as the first fallback.
- Browser `speechSynthesis` remains the emergency fallback.

## License Rule

Allowed:

- `research_only`
- `noncommercial`

Blocked:

- `commercial`
- `premium_commercial`

Operational flag:

```text
TTS_HEBREW_LOCAL_LICENSE_MODE=noncommercial
```

## Still Not Decided Here

- shipping Hebrew as browser-only `web_wasm`
- commercial packaging
- mobile native provider split

See:

- [TTS_HEBREW_WEB_WASM_FEASIBILITY.md](/E:/projects/tts-prototype-android/docs/TTS_HEBREW_WEB_WASM_FEASIBILITY.md)
- [TTS_HEBREW_NONCOMMERCIAL_PACKAGING.md](/E:/projects/tts-prototype-android/docs/TTS_HEBREW_NONCOMMERCIAL_PACKAGING.md)
