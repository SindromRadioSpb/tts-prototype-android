# C1 preregistration — 2026-07-24

This protocol was written before any owner C1 benchmark recording existed. H2.6's 3.421 minutes
are aggregate evidence only: its raw audio and transcripts were deleted by the approved H2.5/H2.6
privacy contract and cannot be reused.

Revision 1, still before owner data: a synthetic Microsoft Asaf engineering run rejected the first
CTC-posterior/scanning design (49/50 synthetic normal sentences flagged; stress manipulation was
not honored by SAPI). The design below is the frozen replacement. Synthetic results select a
measurement method only; they are never charter evidence and no threshold was tuned to make that
fixture pass.

## Research question and fixed outcome thresholds

Can open local components provide word-localized Hebrew pronunciation feedback that is more useful
than “ASR did not understand you”?

The charter thresholds are not changed:

- benchmark: 50 normally pronounced sentences + 25 deliberately distorted sentences;
- success: at least 20/25 distortions detected (80%) and at most 10/50 normal sentences flagged
  (20% false-positive rate);
- a detected distortion counts only when the scorer names the annotated target word and the correct
  type (`VOWEL_SUBSTITUTION` or `STRESS_SHIFT`);
- failure: performance indistinguishable from chance or feedback cannot localize to a word;
- result remains `UNDERPOWERED` until at least 60 minutes of confirmed owner speech exist, even if
  the 75-item benchmark passes.

## Axes (must never be collapsed)

| Axis | Used for pronunciation verdict? | Role |
|---|---:|---|
| ASR correctness | No | Optional diagnostic only; no ASR call in the scorer |
| Pronunciation quality | Yes | Binary benchmark outcome at the annotated word |
| Forced alignment | No | Separately reported coverage/quality; low quality is `UNSCORABLE` |
| Stress | Yes | `STRESS_SHIFT`, separate detector and metric |
| Fluency | No | Descriptive timing only, never an error label |
| Grammar | No | Out of scope |
| Semantics | No | Out of scope |

## Frozen benchmark

`benchmark_manifest.tsv` contains 25 target words. Each appears in two independently worded normal
sentences and one distorted sentence, yielding 50 normal and 25 distorted items. Distortions are
15 single-vowel substitutions and 10 stress shifts. The written sentence is always the intended
normal sentence; only the spoken target changes in a distorted recording.

Record in manifest order with content-free filenames. Do not audition scorer output until all 75
files are complete. Re-record only clipping, silence, interruption or a failure to follow the
prompt; never re-record because of a score.

## Frozen prototype

The prototype is a **targeted pronunciation exercise**: the prompted target word is known before
audio arrives. Free-form error discovery over every sentence word is not claimed. Word localization
means that forced alignment successfully maps feedback to that known target rather than returning a
sentence-level ASR failure.

1. Phonikud ONNX adds sentence diacritics. The manifest's manually vocalized target replaces the
   model target so the evaluated word does not depend on an unreviewed homograph choice.
2. Phonikud converts vocalized words to Modern Hebrew IPA including primary stress.
3. A deterministic mapping converts that IPA to the fixed MMS_FA roman token alphabet.
4. MMS_FA aligns the expected word sequence to the waveform. Alignment score and coverage are
   recorded separately and never called pronunciation quality.
5. Praat Burg formants (F1/F2) are sampled at the target's aligned vowel nuclei. Vowel classes use
   only normal owner rows as speaker calibration. For each normal test row, nested leave-one-row-out
   calibration excludes that row; distorted rows use all 50 normal rows. The raw anomaly score is
   expected-class distance minus nearest-other-class distance after speaker z-scaling. The flag
   threshold is the 80th percentile of nested normal calibration scores, fixed to the charter's
   20% false-positive ceiling; equality is not flagged.
6. Stress detector uses vowel-centered syllable regions and a fixed acoustic prominence composite
   (0.50 log RMS energy + 0.30 voiced autocorrelation strength + 0.20 relative syllable duration,
   each min-max normalized inside the word). The feature is expected-syllable prominence minus the
   strongest alternative. For each normal test row, the threshold is the 10th percentile of other
   normal rows; distorted rows use all normal rows. A value below (not equal to) the threshold flags
   `STRESS_SHIFT`.
7. A word is `UNSCORABLE` rather than wrong if alignment has no spans, its mean CTC span score is
   below `0.08`, or fewer than two vowel nuclei exist for stress evaluation.
8. The targeted item is positive if its target word is flagged. Distorted-item success additionally
   requires the annotated error type. A wrong type is not a true positive.

No rule or quantile may be changed after the first owner recording is scored. Any later change
creates a new preregistration and a fresh benchmark recording set.

## Component gates and stop conditions

- Before owner scoring, manually inspect the 25 target expected IPA strings. If more than 2/25
  (>10%) disagree with the intended modern pronunciation, stop C1 on the Phonikud condition.
- Record alignment coverage. If target-word localization is unavailable on more than 5/75 items,
  stop as fundamentally insufficient for this design rather than treating them as pronunciation
  errors.
- Calendar stop: three weeks from 2026-07-24 without meeting the charter threshold.
- Raw owner audio stays local. Tracked evidence contains only counts, rates and content-free
  incident codes.
- No provider call, LLM, LinguistPro code, review_log/FSRS write or production mutation is allowed.

## Role-lens adversarial review

- R1: target readings are explicit and reviewable; generated sentence G2P cannot silently replace
  the curated target. Any disputed reading becomes unscorable.
- R2/R17: feedback is one word + one error type; it is advisory and never becomes a grade or
  learner-state event.
- R10: alignment, vowel and stress have separate outputs; ASR transcription is not an oracle.
- R11: the benchmark labels are independent of model output; `UNSCORABLE` prevents low alignment
  confidence from becoming a learner error.
- R15: raw recordings and detailed scores remain in gitignored scratch; report is aggregate-only.
- R16: all inference is local and marginal provider cost is zero.
