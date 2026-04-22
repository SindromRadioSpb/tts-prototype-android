# TTS Hebrew Web/WASM Feasibility

Дата: 2026-04-22

## Decision

`WEB_WASM_NEEDS_SEPARATE_RESEARCH`

## Current Answer

The production-like noncommercial Hebrew rollout uses the Python sidecar, not browser `web_wasm`.

## Open Questions

1. Can `phonikud-onnx` run in browser WASM with acceptable startup and memory costs?
2. Can the Hebrew Piper ONNX checkpoint run in browser with matching phoneme pipeline?
3. Is a JS/WASM phonemizer needed, or can `phonikud.phonemize` be replaced browser-side?
4. What is the total asset size for:
   - model
   - config
   - phonemizer runtime
   - optional dictionaries/data
5. What is the real latency on:
   - desktop Chromium
   - Android Chrome
   - iPhone Safari

## Risks

- no proven Hebrew browser bundle comparable to the staged English `sherpa-onnx` path
- likely large asset footprint
- mobile Safari memory limits
- missing browser-side replacement for current Python phonemization path

## Current Recommendation

Keep the split:

```text
Hebrew -> Python sidecar
English -> browser web_wasm
```

Do not merge Hebrew `web_wasm` work into the noncommercial sidecar integration patch.
