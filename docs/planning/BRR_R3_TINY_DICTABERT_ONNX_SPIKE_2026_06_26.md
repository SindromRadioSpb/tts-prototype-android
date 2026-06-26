# BRR R3 — tiny-DictaBERT-ONNX spike (2026-06-26)

**Status:** SPIKE DONE → **NO-GO (drop)**, measured. Full findings + reproduce:
`docs/research/tiny-dictabert-onnx/2026-06-26/`.

> **Result (measured):** encoder exports cleanly; latency 0.7ms/sent (passes); but **int8 = 44.8MB**
> (embedding-dominated 128K×312 floor; standard q4 skips the embedding `Gather` → 163MB) — **over
> the 30MB gate, ~14× the 3.3MB offline core, no quality-safe path under it.** Plus a JS multi-head
> decode port + modern-register weakness on archaic text + marginal payoff (consent-gated Nakdan
> Tier-3 already works). → **drop.** Research's "feasibility LOW" confirmed empirically.

**Original:** SPIKE (owner: "переходи к R3"). Decision-gated; feasibility LOW/unknown per research.
**Predecessor:** R2 names shipped (`960b130`, v3.11.3). Sequence: R1→R3→R2 (R2 done out of order).
**Roles:** R10 lead (measure-before-commit) · R5 (offline-first — payoff is offline Tier-3 *without* network/consent) · R1.
**Research basis:** `docs/planning/RESOLVER_QUALITY_RESEARCH_2026_06_25.md` §R3 · dossier §2.4.

## Goal

Determine empirically whether `dicta-il/dictabert-tiny-joint` (45.2M) can be exported to ONNX,
quantized, and run in **transformers.js (WASM, Web Worker)** to give a **fully-offline Tier-3**
context disambiguator — replacing the current opt-in Dicta Nakdan API call (network + one-time
consent) for the homograph cases the offline form-first resolver can't decide (name-vs-word
שלום/הלל, adverb/participle homographs, etc.).

## Decision gate (R10)

Ship-further IF: exports cleanly **AND** quantized size fits a PWA budget (research target
**<30MB q4**) **AND** latency **<500ms/sentence** in a WASM Worker **AND** accuracy on the gold
homograph tail beats today's offline-only. Otherwise → **drop** (Nakdan API Tier-3 already works).

## Recon (settled before the spike)

| Fact | Value | Source |
|---|---|---|
| tiny-joint params / F32 size | 45.2M / **181 MB** safetensors | HF model card / file tree |
| tasks | seg + morph + lemma + syntax + NER (5 heads, `trust_remote_code`) | model card |
| license | CC BY 4.0 (commercial ok) | model card |
| ready-made tiny ONNX? | **NO** — only `onnx-community/dictabert-ner-ONNX` (base, single NER head) | HF |
| base-NER ONNX sizes (reference) | int8 **185MB**, q4f16 246MB, fp16 368MB, f32 735MB | onnx-community tree |
| **size estimate (tiny, by param×bytes)** | int8 ≈ **~45MB**, q4 ≈ **~20-30MB** (≈128K-vocab embeddings dominate) | derived |
| env | Python 3.11.9 / 3.12.13 (uv) + torch CPU | local |
| current offline core | 3.3 MB gz dict | shipped |

**Read:** size is **borderline-to-over** budget (q4 ~20-30MB = 6-9× today's 3.3MB core); the hard
risk is **exporting the custom 5-head joint arch** (no precedent — onnx-community only did the
single-head NER base). Payoff is marginal (offline Tier-3 *without consent*, when consent-Tier-3
already ships). The spike resolves export-feasibility + true size + latency empirically.

## Spike steps

1. Python 3.12 venv + torch(CPU) + transformers + optimum[onnxruntime] + onnx/onnxruntime. *(running)*
2. Load `dictabert-tiny-joint` (`trust_remote_code`), inspect the head structure + forward outputs.
3. Export to ONNX — try `optimum-cli export onnx` first; fall back to manual `torch.onnx.export`
   capturing the multi-head logits. Record what breaks (the key unknown).
4. Quantize (`onnxruntime.quantization` dynamic int8; q4 if available) → **measure real file size**.
5. Latency micro-bench (onnxruntime CPU, single sentence) as a WASM-latency proxy.
6. (if it fits) quick accuracy sanity vs the gold homograph tail.

## Outcome → `docs/research/tiny-dictabert-onnx/2026-06-26/` (Artifact storage rule)
Measured size/latency/export-notes + go/no-go recommendation. Venv + model download = scratch
(not committed); the export script + findings are the tracked record.
