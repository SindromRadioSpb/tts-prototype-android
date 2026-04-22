# TTS Hebrew Noncommercial Packaging

Дата: 2026-04-22

## Goal

Run Hebrew Local Piper in a noncommercial app configuration without removing online fallback.

## Dependencies

- Python environment with `fastapi`, `uvicorn`
- `phonikud-onnx`
- `piper-onnx`
- `phonikud`
- cached model files from:
  - `thewh1teagle/phonikud-onnx`
  - `thewh1teagle/phonikud-tts-checkpoints`

## Runtime Paths

- sidecar file: [ai-local/hebrew_tts_sidecar.py](/E:/projects/tts-prototype-android/ai-local/hebrew_tts_sidecar.py)
- sidecar cache: `audio-cache/hebrew-local/`
- model cache: `experiments/hebrew_tts_phonikud_piper/.cache/`

## Start Sidecar

```powershell
cd E:\projects\tts-prototype-android
$env:TTS_HEBREW_LOCAL_EXPERIMENTAL="true"
$env:TTS_HEBREW_LOCAL_LICENSE_MODE="noncommercial"
uvicorn ai-local.hebrew_tts_sidecar:app --host 127.0.0.1 --port 8766
```

## Health Check

```powershell
Invoke-RestMethod http://127.0.0.1:8766/tts/hebrew/phonikud-piper/health
```

## UI Enablement

The UI provider selector exposes:

- `Online TTS`
- `Hebrew Local Piper`
- `Local Piper / Web WASM`
- `Browser fallback`

The selected provider and per-provider voice are persisted in browser storage.

Mobile clients use the same provider through the Node server bridge:

```text
mobile browser -> Node server -> Hebrew sidecar on server host
```

The browser does not need direct access to sidecar `127.0.0.1:8766`.

## Fallback Rule

If Hebrew sidecar is unavailable or blocked:

```text
Hebrew Local Piper -> Online TTS -> Browser fallback
```

## Disable Local Hebrew Provider

Set either:

```text
TTS_HEBREW_LOCAL_EXPERIMENTAL=false
```

or

```text
TTS_HEBREW_LOCAL_LICENSE_MODE=commercial
```

The UI will show the provider as disabled or blocked and will fall back to online TTS.

## License Notice

Hebrew Local Piper is allowed only for noncommercial use in this project configuration.
