# TTS Hebrew Feasibility Audit

Дата: 2026-04-22

## Summary

- Готового supported Hebrew `sherpa-onnx` browser TTS bundle не найдено.
- Официального Hebrew voice в `rhasspy/piper-voices` не найдено.
- Рабочий research stack существует у `thewh1teagle`: `phonikud-onnx` + `phonikud` + `piper-onnx` + `phonikud-tts-checkpoints`.
- Практически реалистичный путь для дальнейших экспериментов: Python sidecar, не `web_wasm`.

## Candidate Matrix

| Candidate | Source | Runtime | Input | Output | License | Browser-ready | Sidecar-ready | Quality unknown? | Decision |
|---|---|---|---|---|---|---|---|---|---|
| Current online TTS | current repo `/api/tts` | Node + Google Cloud TTS | raw text | MP3 | product-controlled | n/a | yes | no | KEEP |
| Browser fallback | browser `speechSynthesis` | browser native | raw text | speaker playback | browser/platform | yes | n/a | yes | KEEP AS FALLBACK |
| English Piper web_wasm | current repo staged English bundle | `sherpa-onnx` wasm | raw text | WAV/PCM | existing staged assets | yes | n/a | low | KEEP FOR ENGLISH |
| `heb-piper-tts-gemma-g2p-onnx` | GitHub repo | Python + ONNX Runtime + Gemma G2P + Piper | raw Hebrew text | WAV | no repo license file; downstream model licenses unclear | no | maybe | high | NO-GO FOR PRODUCT |
| `phonikud-tts` | GitHub repo | Python + `phonikud-onnx` + `piper-onnx` | raw Hebrew text | WAV | CC BY-NC 4.0 + academic restriction | no | yes | medium | RESEARCH ONLY |
| `phonikud + piper-onnx + checkpoints` | Hugging Face + pip/git deps | Python + ONNX Runtime | raw Hebrew text -> vocalized -> phonemes | WAV | mixed, includes non-commercial checkpoints | no | yes | medium | RESEARCH ONLY |
| Official `sherpa-onnx` Hebrew TTS model | `k2-fsa` docs | `sherpa-onnx` | unknown | unknown | unknown | not found | not found | high | NOT AVAILABLE |

## Confirmed Facts

1. `public/index.html` currently tries local portable TTS before `/api/tts`, so without policy gating Hebrew can be intercepted by local runtime rather than Google online TTS.
2. `server.js` exposes browser TTS config via `/api/client-config`.
3. `k2-fsa` TTS model listing does not show Hebrew in the official supported TTS models page.
4. `rhasspy/piper-voices` current `voices.json` query returned no `he_*` voice keys.
5. `thewh1teagle/heb-piper-tts-gemma-g2p-onnx` depends on:
   - `onnxruntime`
   - custom `optimum-onnx`
   - `piper-onnx`
   - HF snapshot for Gemma G2P
   - external `shaul.onnx` + `model.config.json`
6. That repo has no `LICENSE` file in the Git checkout used for this spike.
7. `phonikud` documents the intended training/runtime flow explicitly as:
   raw text -> diacritics -> enhanced diacritics -> phonemes -> TTS model trained on phonemes.
8. The reproducible PoC path that worked in this repo is:
   `phonikud-onnx` -> `phonikud.phonemize()` -> `piper-onnx` + `shaul.onnx`.

## Audit Notes

- `heb-piper-tts-gemma-g2p-onnx` is more of a research demo than an integration-ready product path.
- The Gemma G2P path adds another model tier and a separate license/compliance surface.
- `phonikud-tts-checkpoints` contains multiple ONNX and checkpoint artifacts and sample WAVs, but the model card declares non-commercial usage.

## Decision

- Hebrew local TTS exists as a viable research PoC.
- Hebrew local TTS is not cleared for premium/commercial integration.
- Hebrew `web_wasm` staging is postponed until:
  - license is clarified or replaced,
  - quality is manually reviewed,
  - a browser-compatible supported runtime/model path is proven.
