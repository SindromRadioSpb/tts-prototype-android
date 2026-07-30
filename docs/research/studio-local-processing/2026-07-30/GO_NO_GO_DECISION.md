# Studio Ingest L0 — GO/NO-GO decision

Date: 2026-07-30

Scope: measure-before-code research only; no product, schema, production, provider-default, or permanent integration change.

## Decision

**GO to an L1 design using `ivrit-ai/whisper-large-v3-turbo-ct2` at pinned revision `72ad623a37947395efcc3933132353790e5a12f5` as the sole local default candidate.** This is permission to design L1, not permission to integrate or ship it.

**NO-GO for `ivrit-ai/whisper-large-v3-ct2` as the L1 default.** It fits the measured RTX 3070 8 GB in FP16, so the hardware gate passes, but it used 5,295 MiB total GPU memory in bounded preflight, was 3.7x slower on S12 and 3.3x slower on the 194-minute boundary, and had worse batch WER (6.49% vs 2.60%). Its small improvement on the silver podcast oracle (19.15% vs 20.66% WER) is insufficient. It may remain an offline comparison candidate.

**Retain Gemini only as the cloud baseline.** The requested `gemini-flash-latest` alias resolved to `gemini-3.6-flash`. It uploaded 283,378,732 bytes for the four completed cases, hit HTTP 429 before boundary/batch, and failed independent clock validation: two podcast chunks and seven S12 chunks were expanded. The podcast timestamp errors were p50 235.0 s and p95 614.5 s. Model timestamps are therefore not accepted as an oracle.

## Why turbo passes L0

- RTX 3070 hardware truth: turbo used a measured 2,330 MiB VRAM delta in bounded smoke, with zero upload and zero API cost.
- Complete workload: clean, frozen-noise, 30-minute conversation/multispeaker, S12 117-minute, 194-minute long boundary, and batch-20 all completed.
- Gold checks: clean/noise WER 0%; batch WER 2.60%, CER 0.93%.
- Silver podcast oracle: WER 20.66%, CER 10.46%; timestamp error p50 1.79 s, p95 4.24 s.
- S12/long integrity: no zero-text significant chunk, no clock-compressed/expanded chunk, duplicate 4-gram rates 1.06% and 0.67%.
- Throughput: RTF 0.0248 on S12 and 0.0289 on the 194-minute boundary.

## L1 gates that remain

1. Design must keep physical slicing and the independent S12.5–S12.7 validators; Whisper timestamps remain evidence, not truth.
2. Re-run a larger, human-transcribed and speaker-stratified Hebrew set before claiming a general quality threshold.
3. Specify cancellation, thermal/concurrency limits, model lifecycle/storage, and fallback behavior for 8 GB cards.
4. Resolve `ai-local/README.md` port drift (`8765`) against canonical `8799` in a separately authorized documentation change.
5. No permanent integration until the owner approves the L1 design.

## Adversarial review

- **Could the full model have been rejected because of contaminated VRAM?** Initial attempts were contaminated by three orphan runner processes. Those results were discarded, exact PIDs were removed, idle VRAM returned to ~1,012 MiB, and full FP16 was rerun successfully. The decision uses only the corrected run.
- **Is YouTube subtitle WER ground truth?** No. It is labeled a silver oracle and is used only for same-input comparison. S12 and boundary WER/CER are absent rather than fabricated.
- **Do Gemini timestamps prove audio completeness?** No. Physical chunks, zero-output checks, duplication and independent clock-span checks decide integrity.
- **Was the full-model batch mixed from another configuration?** It was produced in the immediately preceding clean FP16 preflight with the same model revision, compute type, runner and inputs; its raw hash is retained in the unified manifest.
- **Are resource peaks directly comparable to throughput runs?** Only approximately. Orchestration timeouts prevented long-run resource aggregates from being finalized, so peak resource evidence comes from bounded runs and RTF from provider timers retained in raw files. The report does not claim long-run peak precision.
- **Is the corpus representative?** No. The human-gold set is small; this is an L0 feasibility result, not a product-quality acceptance study.
