# R3 spike — tiny-DictaBERT ONNX feasibility (2026-06-26)

Empirical spike: can `dicta-il/dictabert-tiny-joint` (45.2M) become a **fully-offline, in-browser
Tier-3** context disambiguator (transformers.js / onnxruntime-web, WASM Worker), replacing the
opt-in Dicta Nakdan API call? Plan: `docs/planning/BRR_R3_TINY_DICTABERT_ONNX_SPIKE_2026_06_26.md`.

## Verdict: **NO-GO (drop)** — size gate fails; payoff marginal.

## Measured (this spike, CPU, onnxruntime 1.27, torch 2.12)

| metric | value | gate | pass? |
|---|---|---|---|
| encoder export to ONNX | **clean** (torch.onnx dynamo + onnxscript, opset 17) | must export | ✅ |
| encoder params | 44.67M (of 45.2M total; 128K×312 embedding ≈ 40M = the bulk) | — | — |
| **int8 size** (quantize_dynamic, embeddings incl.) | **44.8 MB** | <30 MB | ❌ over |
| q4 (MatMul-4bit) size | **163 MB** — quantizer skips the embedding `Gather` → stays fp32 | <30 MB | ❌ worse |
| latency | **0.7 ms/sentence** (int8, CPU, seq 5) | <500 ms | ✅ easily |
| + tokenizer.json | 3.6 MB (must also ship) | — | — |

**Why size can't reach the gate:** the model is **embedding-dominated** (128K vocab × 312 dim ≈
40M of 45.2M params). Standard 4-bit (`MatMulNBitsQuantizer`) only touches `MatMul` nodes, not the
embedding `Gather` → q4 = 163 MB. Only `quantize_dynamic` (int8) compresses the embedding →
**44.8 MB is the standard, quality-safe floor**. Reaching ~22-25 MB needs **non-standard int4
embedding quantization** (custom, with real accuracy risk on a 128K vocab). The onnx-community
DictaBERT-**base** ONNX shows the same pattern (int8 185 MB, "q4f16" 246 MB — q4 didn't shrink).

## Why NO-GO (beyond size)

1. **Size:** 44.8 MB int8 (≈48 MB with tokenizer) is **~14× the current 3.3 MB offline core** — a
   major offline-first PWA payload increase, over the 30 MB gate, with no quality-safe path under it.
2. **Engineering tail:** the encoder exports, but a working Tier-3 needs the **multi-head decode
   logic** (morph/prefix/NER from `BertForMorphTagging.py` / `BertForPrefixMarking.py`) ported to
   JS + onnxruntime-web Worker wiring. Non-trivial beyond the export.
3. **Register mismatch:** the model is trained on **modern** Hebrew (HTB/UD). On archaic Ben-Yehuda
   it carries the same register weakness the R1 research already flagged for Dicta — a *tiny* model
   likely fares **worse** than the base Nakdan API we already use for Tier-3.
4. **Marginal payoff:** the only win is offline Tier-3 *without network/consent* — and the
   **consent-gated Nakdan API Tier-3 already ships and works** (auto-on-tap after one-time consent).

## Files

| File | What |
|---|---|
| `inspect_model.py` | loads tiny-joint, dumps arch/heads/forward (how the 5-head structure was read) |
| `export_encoder.py` | exports the encoder → ONNX, int8/q4 quantize, size + latency bench |
| `export_result.json` | the measured numbers above |

Scratch (NOT committed — regenerable via the scripts): the venv, the 181 MB model download, and the
`encoder_*.onnx` files live in the session scratchpad.

## Reproduce

```
uv venv --python 3.12 r3venv
uv pip install --python r3venv torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python r3venv transformers "optimum[onnxruntime]" onnx onnxruntime onnxscript numpy
PYTHONIOENCODING=utf-8 r3venv/Scripts/python export_encoder.py
```

## If revisited later

Only worth reopening if Dicta ships a **smaller-vocab** or **already-quantized tiny** model, or if
a fully-offline-without-consent Tier-3 becomes a hard product requirement. Otherwise the offline
form-first core + L1–L5 honesty + R2 names + consent-gated Nakdan Tier-3 is the better stack.
