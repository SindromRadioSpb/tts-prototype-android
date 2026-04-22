# TTS Hebrew License Review

Дата: 2026-04-22

## Decision State

`LICENSE_BLOCKED_FOR_COMMERCIAL`

Практический operational label для этого spike:

`LICENSE_OK_FOR_RESEARCH_ONLY`

## Source Review

| Artifact | Source | Observed license state | Commercial-safe? | Notes |
|---|---|---|---|---|
| `phonikud` code | GitHub `thewh1teagle/phonikud` | CC BY 4.0 | yes, with attribution | repo explicitly says code license only; datasets have separate licenses |
| `phonikud-onnx` model | Hugging Face `thewh1teagle/phonikud-onnx` | MIT | yes | model card shows `License: mit` |
| `piper-onnx` | GitHub `thewh1teagle/piper-onnx` | MIT | yes | runtime wrapper only |
| `phonikud-tts` | GitHub `thewh1teagle/phonikud-tts` | CC BY-NC 4.0 + academic/educational only | no | repo `LICENSE` forbids commercial and non-academic non-commercial use |
| `phonikud-tts-checkpoints` | Hugging Face model card | `non commercial (cc-nc)` | no | model README explicitly says non-commercial |
| `saspeech` dataset | Hugging Face dataset card | non-commercial via OpenSLR | no | relevant because the Hebrew TTS checkpoints are trained on it |
| `heb-piper-tts-gemma-g2p-onnx` | GitHub repo | unclear | no | no repo license file; downstream model licenses unresolved |
| `gemma3-heb-g2p` / Gemma path | Hugging Face / Google upstream | unresolved for this spike | risky | not accepted for product use without dedicated review |

## Conclusions

1. The working Hebrew PoC path in this spike depends on non-commercial checkpoints.
2. That alone blocks premium/commercial shipping.
3. Even though `phonikud` code and `phonikud-onnx` are permissive enough, the voice model path is not.
4. `heb-piper-tts-gemma-g2p-onnx` is license-unclear, so it is not a safer alternative.

## Allowed Usage For This Repo

- local research spike
- technical feasibility experiments
- sidecar PoC behind explicit experimental flag

## Disallowed Usage

- production default
- premium/commercial rollout
- packaged release as a shipped Hebrew local voice

## Required Next Step

- contact the model author for a commercial license or a commercially-usable checkpoint lineage
- otherwise keep Hebrew default on online TTS
