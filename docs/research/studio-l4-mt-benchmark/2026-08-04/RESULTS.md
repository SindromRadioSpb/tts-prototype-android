# L4.0a Hebrew↔Russian MT benchmark — final results

Verdict: **COMPLETE UNDER MANIFEST v3 / LIMITED EVIDENCE / NO BILINGUAL
HUMAN VALIDATION**.

## Executive decision

Gemini 3.6 Flash is the strongest measured system on the equal FLORES+ Stage A
set. Its macro chrF++ is 53.0284 versus 48.4938 for the best local candidate.
MADLAD is the best local candidate on both FLORES reference metrics and the
200-row in-domain AI-reference set, so this benchmark does **not** justify
replacing the current local MADLAD implementation with OPUS, NLLB or Hy-MT2.

This is a quality-positioning result, not an enablement decision. Translation
must stay an editable draft: targeted inspection found added/lost meaning,
degenerate repetition and failures on vocalized literary Hebrew. Gemini also
refused two benign FLORES rows. A future design packet may consider Gemini as an
explicit BYOK cloud ceiling, never as an automatic fallback.

## Evidence contract and limitation

Every candidate translated the same deterministic 506 shared FLORES+ devtest IDs
in both directions: 1012 rows per candidate. Metrics are sacreBLEU chrF++
(`word_order=2`), spBLEU (`flores200` tokenizer), and deterministic 1000-sample
95% bootstrap intervals. CometKiwi is supplementary only.

The in-domain Russian references were generated with GPT-5.6 Sol high according
to the owner's attestation and accepted by the owner for comparison. They remain
AI-reference/silver, not human gold. The owner explicitly waived a bilingual
blind review because no qualified reviewer is available. Model-assisted auditing
cannot replace that missing independent human signal; consequently no result here
supports a human-equivalence or pedagogical-safety claim.

## FLORES+ Stage A results

| System | he→ru chrF++ (95% CI) | he→ru spBLEU (95% CI) | ru→he chrF++ (95% CI) | ru→he spBLEU (95% CI) | Macro chrF++ | Macro spBLEU |
|---|---:|---:|---:|---:|---:|---:|
| Gemini 3.6 Flash | 55.2935 (54.1345–56.4597) | 39.5476 (38.0327–41.0019) | 50.7633 (49.5398–51.9611) | 34.7311 (33.2107–36.2960) | **53.0284** | **37.1394** |
| MADLAD-400-10B CT2 int8 | 50.8068 (49.6362–51.9640) | 34.0877 (32.6534–35.6324) | 46.1807 (45.1144–47.4404) | 31.1628 (29.8824–32.5870) | **48.4938** | **32.6253** |
| OPUS transformer-big CT2 int8 | 47.3821 (46.2613–48.5007) | 29.2104 (27.8394–30.6605) | 46.6216 (45.3939–47.7110) | 30.8211 (29.2534–32.3326) | 47.0019 | 30.0158 |
| NLLB-distilled-1.3B CT2 int8 | 48.2738 (47.0611–49.4600) | 30.5446 (29.0291–32.0665) | 45.3226 (44.2076–46.5335) | 29.1370 (27.6969–30.6825) | 46.7982 | 29.8408 |
| Hy-MT2-1.8B FP16 | 46.2042 (45.0454–47.2913) | 27.1944 (25.7620–28.5567) | 42.8648 (41.7532–43.9304) | 24.7172 (23.4593–26.0383) | 44.5345 | 25.9558 |

Local reference-based ordering is MADLAD → OPUS → NLLB → Hy-MT2. MADLAD's
macro chrF++ lead over OPUS is only 1.4919; on ru→he OPUS is ahead by 0.4409
and their bootstrap intervals overlap. The data therefore supports retaining
MADLAD, but not claiming a universal decisive margin over OPUS.

## Supplementary CometKiwi

| System | Mean score |
|---|---:|
| Gemini 3.6 Flash | 0.810223 |
| MADLAD | 0.799688 |
| Hy-MT2 | 0.791947 |
| NLLB | 0.787352 |
| OPUS | 0.772703 |

CometKiwi ranks local systems MADLAD → Hy-MT2 → NLLB → OPUS, conflicting with
both reference metrics after first place. This confirms why CometKiwi is an
advisory signal rather than the winner oracle.

## In-domain Hebrew→Russian evidence

| Local system | chrF++ (95% CI) | spBLEU (95% CI) |
|---|---:|---:|
| MADLAD | **44.0735** (41.3752–46.4730) | **26.5541** (23.8620–29.1182) |
| Hy-MT2 | 40.7494 (38.8520–42.6086) | 21.6313 (19.3648–23.7534) |
| NLLB | 40.6182 (38.5185–42.6797) | 20.7136 (18.4645–23.1179) |
| OPUS | 38.6030 (36.6192–40.4402) | 20.7049 (18.5767–22.8142) |

Gemini has only an earlier 13/200 in-domain partial and is excluded. Natural
niqqud-bearing rows were harder for every local model: absent/present chrF++ was
45.84/42.99 for MADLAD, 45.53/37.76 for Hy-MT2, 45.30/37.70 for NLLB and
43.86/35.31 for OPUS.

## Failure audit

Automated diagnostics scanned all rows; a model-assisted targeted inspection
then reviewed critical/low-quality examples. It found:

- Gemini returned empty provider failures for `FLORES-he-ru-0591` and
  `FLORES-ru-he-0754`; both were benign source sentences marked
  `PROHIBITED_CONTENT` by the provider.
- OPUS produced no target script on 12 vocalized literary rows, often only a
  replacement symbol.
- MADLAD produced nine degenerate-repetition flags in-domain; `ID-LIT-144`
  adds an unrelated Soviet partisan/Stalin narrative to a rabbinic passage.
- NLLB `ID-LIT-006` produces an unrelated prison sentence.
- Hy-MT2 `ID-LIT-096` loses the source meaning.
- NLLB had zero 512-token truncations. Stage A's maximum measured NLLB source
  length was 107 tokens, so this sample does not stress the 512-token cap.

These observations are evidence of risk, not bilingual human scores. Learner-facing
use needs visible provenance, editability, deterministic empty/repetition/script
guards and no silent fallback.

## Operating profile and cost

| System | Stage A throughput | Peak GPU used | Notes |
|---|---:|---:|---|
| OPUS | 1.813 seg/s; 54.95 output tok/s | n/a | CPU-only; ambient GPU readings excluded |
| NLLB | 1.429 seg/s; 54.75 output tok/s | 3411 MiB | zero truncations |
| Hy-MT2 | clean slice 0.193 seg/s; 12.16 output tok/s | overall sample invalid | duplicate-process contamination affected the full-run timing/VRAM sample; output remained deterministic |
| MADLAD | 0.238 seg/s; 9.81 output tok/s | 7887 MiB | current deployed 256-token cap; no cap hits |
| Gemini | 0.172 recorded seg/s | cloud | network/API time; two provider failures |

Gemini Stage A estimated list-price cost was **$7.685232**. The owner stopped the
full-run continuation at 1118/2024 rows: 106 extra non-comparative rows cost about
$0.8104, for an estimated stopped-run total of $8.4957. Actual account charge is
unknown. The partial SHA-256 is
`631f5ddd4a6e9a75e1f1f26fcbd0dfceadfc6c980a183d78426d1904014862d3`.

## Manifest v3 closure

The v2 adaptive gate fired on all four conditions: top-local ΔchrF++ below 2,
bootstrap overlap, metric-ranking conflict and critical failure flags. Under
D-HNR-8 the owner explicitly deferred the resulting full-devtest expansion.
Comparative ranking therefore uses exactly 1012 rows for every system; the
Gemini extra rows are provenance/cost evidence only and top-2 local full runs
were not started. A future expansion requires a new explicit GO.

No production configuration or model was changed. The next ledger action is
L4.0c, not implementation: the L4 design packet follows only after L4.0c and
L4.0b.
