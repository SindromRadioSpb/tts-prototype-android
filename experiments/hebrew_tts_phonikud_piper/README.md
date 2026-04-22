# Hebrew Phonikud/Piper PoC

Research-only Hebrew TTS experiment. This folder is intentionally isolated from the main UI/runtime.

## Scope

- Hebrew text -> `phonikud-onnx` -> vocalized text
- vocalized text -> `phonikud.phonemize()` -> phonemes
- phonemes -> `piper-onnx` + `shaul.onnx` -> WAV

## License status

- `phonikud` code: CC BY 4.0
- `phonikud-onnx`: MIT
- `phonikud-tts` and `phonikud-tts-checkpoints`: non-commercial / research-only

Do not ship this path as a premium/commercial default.

## Commands

```powershell
cd E:\projects\tts-prototype-android\experiments\hebrew_tts_phonikud_piper
uv run run_poc.py
```

Single phrase:

```powershell
uv run run_poc.py --text "שלום עולם"
```

## Downloaded assets

Assets are cached under `.cache/` and are ignored by git:

- `thewh1teagle/phonikud-onnx` -> `phonikud-1.0.int8.onnx`
- `thewh1teagle/phonikud-tts-checkpoints` -> `shaul.onnx`
- `thewh1teagle/phonikud-tts-checkpoints` -> `model.config.json`

`run_poc.py` rewrites the Piper config to an ASCII-only copy because `piper-onnx` currently reads JSON with the system text encoding on Windows.

## Outputs

- `out/*.wav` — generated smoke phrase audio
- `out/results.json` — phrase-level timings and metadata
