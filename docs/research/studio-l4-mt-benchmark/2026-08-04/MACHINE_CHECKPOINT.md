# L4.0a machine checkpoint — 2026-08-04

Status: **IN PROGRESS — NOT A QUALITY VERDICT**. This checkpoint records work
that is complete and reproducible before the remaining external and human
gates. It cannot be used to select or enable a production translator.

## Completed

- frozen 200-row Q4 source worksheet committed under
  `docs/research/heb-ru-mt-gold/2026-08-04/`;
- exact candidate revisions/licenses and local binary hashes recorded in
  `candidate-manifest.json`;
- reproducible runner, validation, scoring, blind-packet and durable cloud
  resume paths implemented in `scripts/research/l4_mt_benchmark.py`;
- real translation smoke passed for all five mandatory candidates;
- complete he→ru in-domain inference finished for all four local candidates;
- stable Gemini 3.6 Flash produced 13 durable rows before a persistent HTTP 429
  quota failure on row 14; no completed/billed output was lost.

## In-domain operational results (200 frozen rows)

These numbers compare the current run configurations, not translation quality.
OPUS is CPU-only; its sampled GPU values are ambient desktop usage and are not
attributed to OPUS.

| System | Rows | Wall s | Seg/s | Output tok/s | Peak GPU used MiB | Output SHA-256 |
|---|---:|---:|---:|---:|---:|---|
| OPUS heb-sla transformer-big CT2 int8, CPU | 200 | 48.784 | 4.100 | 109.873 | n/a | `1435736b…caa4` |
| NLLB-distilled-1.3B CT2 int8_float16 | 200 | 104.235 | 1.919 | 56.325 | 2871 | `a2e196bc…c69a` |
| Hy-MT2-1.8B FP16 deterministic | 200 | 726.324 | 0.275 | 11.123 | 5619 | `dd83a8ff…a2f` |
| MADLAD-400-10B CT2 int8_float16, deployed cap 256 | 200 | 1086.518 | 0.184 | 6.235 | 7849 | `69fd2cc9…5010` |
| Gemini 3.6 Flash BYOK | 13/200 | 117.559 recorded row time | — | — | cloud | partial `12391b4b…5d14` |

MADLAD used the same 256-token decoding cap as the existing Studio adapter.
There were no cap hits (maximum output was 126 tokens), so the 18.1-minute wall
time is not an artifact of a runaway 1024-token benchmark setting. On this
sample OPUS was about 17.6× faster than MADLAD by output tokens/s while leaving
the GPU free.

## Early red signals (not rankings)

- MADLAD row `ID-LIT-144` hallucinates a Soviet partisan/WWII story that is not
  in the Hebrew source. This must be scored as added/lost meaning during blind
  owner review; it is not inferred from an automatic metric.
- NLLB and Hy-MT2 show visible lexical/semantic distortions on older literary
  Hebrew in spot inspection. The owner gold and blind packet decide their
  severity.
- No local candidate produced empty rows. NLLB had zero source truncations on
  this 200-row set; the separate long-input/FLORES+ gate remains undone.
- Gemini completed 13 rows (374 input / 98 output tokens, estimated list price
  `$0.001296`) and then returned HTTP 429 through ten bounded retries. Resume
  starts from `ID-ASR-014`; model substitution is prohibited.

## Mandatory gates still open

1. Owner accepts access conditions for official
   `openlanguagedata/flores_plus` and `Unbabel/wmt22-cometkiwi-da`, then logs the
   machine into Hugging Face without sending a token through chat.
2. Owner fills all 200 `reference_text` cells in
   `in-domain-owner-gold.tsv`; model output cannot be used as human gold.
3. Run FLORES+ v4.6 devtest both directions for all five systems.
4. Resume Gemini from row 14 after quota availability.
5. Compute chrF++/spBLEU, supplementary CometKiwi, long-input and
   niqqud/punctuation robustness results.
6. Generate and complete a blind packet over at least 40 randomized sources,
   including missing meaning, added meaning, and pedagogical suitability.
7. Only then write the winner/Gemini-positioning verdict and mark ledger step 3
   DONE.

## Safe resume commands

After accepting both gated resources and authenticating locally:

```powershell
ai-local\.venv\Scripts\python.exe scripts\research\l4_mt_benchmark.py fetch-flores `
  --revision 5fec6c13f9e5a4db2f745d4ec0d7c9721ddc4f06 `
  --output-dir .tmp\l4-mt\flores-plus-v4.6 `
  --combined-output .tmp\l4-mt\flores-plus-v4.6\he-ru-devtest.tsv `
  --manifest .tmp\l4-mt\flores-plus-v4.6\manifest.json
```

Gemini resume uses the same output path and `--resume`; the key is loaded from
the local environment and must never be pasted into a command log or artifact.

No production service, provider default, ASR model, learner state, or closed
P2/P3/P4/L1 canon was changed during this checkpoint.
