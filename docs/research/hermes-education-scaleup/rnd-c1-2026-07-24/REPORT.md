# C1 Hebrew pronunciation scoring — evidence report

Date: 2026-07-24. Research status: **DONE_NO_GO / UNDERPOWERED**.

Product follow-up: **C1 EXPERIMENTAL LOCAL COMPANION AUTHORIZED** by the owner after the frozen
result. This does not change, reinterpret or erase the negative research verdict below.

## Protocol

Frozen before owner data in `PREREGISTRATION.md`. Contract benchmark and thresholds remain
50 normal + 25 distorted, sensitivity >=80%, normal-sentence false-positive rate <=20%, and
word+type localization. ASR correctness, alignment, stress, fluency, grammar and semantics are
separate axes.

## Live data preflight

- H2.5 and H2.6: CLOSED.
- H2.7: IN_PROGRESS, but no active stop condition affects C1.
- Historical owner voice evidence: 205.28 seconds / 3.421 minutes, 2 confirmed previews, one
  corrected; owner rating 5/5.
- Reusable C1 raw data at preflight: **0 files / 0 seconds**. H2.5/H2.6 correctly deleted raw audio and retained
  no transcript. `G:\HERMES_AGENT\voice-inbox` was empty and no audio existed under the Hermes
  project tree at preflight.
- Owner C1 benchmark recorded after preregistration: **75 local WAV files / 430.054 seconds /
  7.168 minutes**. Files and detailed measurements remain gitignored and local.
- Combined confirmed duration available as aggregate evidence: **10.589 minutes** (3.421 historical
  H2.6 + 7.168 C1), still below the recommended 60-minute maturity target.
- Maturity: `UNDERPOWERED`.

## Prototype evidence

- Phonikud 0.4.1 generated stress-bearing IPA locally.
- TorchAudio 2.8.0 MMS_FA downloaded its public multilingual checkpoint and successfully aligned a
  locally generated Hebrew engineering fixture word by word.
- Example engineering alignment (not owner evidence): five words localized; word mean CTC scores
  ranged 0.149–0.599. This proves the path runs, not that it meets the pronunciation threshold.
- Adversarial engineering iteration rejected the initial design: direct CTC posterior margins over
  all words produced 49/50 synthetic false-positive sentences and 0/10 stress detections. The
  preregistration was revised before owner data to targeted-word, speaker-calibrated formant/stress
  scoring with nested leave-one-row-out normal evaluation.
- Revised synthetic Asaf diagnostic (still not charter evidence): 9/25 correct word+type detections
  (9/15 vowel, 0/10 stress), 11/50 false positives, 0 target alignment failures. It intentionally
  remains a failing engineering diagnostic; SAPI did not enact Phonikud's private stress mark, and
  thresholds were not tuned to make synthetic speech pass.
- No ASR call, provider call, LinguistPro code change, production mutation, FSRS/review_log write or
  raw owner data retention occurred.
- Material production blocker discovered: MMS_FA weights are CC BY-NC 4.0 and TorchAudio's 2.8
  forced-alignment API is deprecated for removal. Even a positive owner benchmark would require a
  separately licensed and maintained alignment component before production planning could be sound.

## Benchmark result vs thresholds

| Metric | Required | Measured |
|---|---:|---:|
| Distortions detected with correct word+type | >=20/25 | **15/25 (60%) — FAIL** |
| False positives on normal sentences | <=10/50 | **15/50 (30%) — FAIL** |
| Vowel substitutions, correct word+type | reported separately | 13/15 |
| Stress shifts, correct word+type | reported separately | 2/10 |
| Target alignment failures | <=5/75 design stop | **0/75 — PASS** |
| One-sided binomial p vs 0.5 | evidence, not a tuned threshold | 0.212178 |
| Evidence maturity | >=60 min recommended | 10.589 min aggregate; `UNDERPOWERED` |

## Current recommendation

**DONE_NO_GO / UNDERPOWERED.** The frozen owner benchmark did not meet either quality threshold.
Alignment/localization itself was available on all 75 items, so the measured failure is detector
quality rather than missing target spans. Stress is the weakest measured axis (2/10). The failed
result is retained as evidence; the scorer and thresholds were not changed and the owner recordings
were not rescored.

The result does **not** support a claim of reliable pronunciation assessment. On 2026-07-24 the
owner nevertheless separately authorized an explicitly experimental product path with the measured
limitations visible to the user. That decision is a product-risk acceptance, not a research GO.

## What a later GO would require

Any claim that quality improved requires a new algorithm, new preregistration and fresh recordings.
The authorized experimental path must remain opt-in and advisory-only, must not write FSRS,
`review_log`, grades or progress, and must display the measured 60% sensitivity / 30% false-positive
rate / 2-of-10 stress result. MMS_FA is allowed only while LinguistPro remains noncommercial; its
CC BY-NC attribution and the pinned/deprecated TorchAudio runtime remain explicit operational debt.

The production architecture is a local loopback companion: raw audio, model inference and the
speaker calibration profile stay on the user's device. The production web application supplies
the interface only. Deployment and enabling were separately approved by the owner; rollback is a
runtime flag that removes the entry point without changing learner data.
