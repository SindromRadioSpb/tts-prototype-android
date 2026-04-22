# TTS Hebrew Noncommercial Packaging

Дата: 2026-04-22

## Goal

Keep the Hebrew Local Piper packaging path documented without exposing it as an active product provider.

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

## UI Status

The product UI now treats these provider paths as disabled:

- `Online TTS`
- `Hebrew Local Piper` — disabled, kept for future experiments
- `Local Piper / Web WASM` — disabled, kept for future experiments
- `Browser fallback` — available only as a clearly marked low-quality option

The selected provider and per-provider voice are persisted in browser storage.

Mobile clients use the same provider through the Node server bridge:

```text
mobile browser -> Node server -> Hebrew sidecar on server host
```

The browser does not need direct access to sidecar `127.0.0.1:8766`.

## Product Rule

The active product chain is:

```text
Online TTS -> Browser fallback
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

The UI keeps the provider disabled and uses Online TTS as the default product path.

## License Notice

Hebrew Local Piper remains allowed only for noncommercial experiments in this project configuration.
