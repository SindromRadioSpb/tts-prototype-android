# C1 Hebrew pronunciation scoring — evidence report

Date: 2026-07-24. Status: **IN_PROGRESS / UNDERPOWERED**.

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
- Reusable C1 raw data: **0 files / 0 seconds**. H2.5/H2.6 correctly deleted raw audio and retained
  no transcript. `G:\HERMES_AGENT\voice-inbox` was empty and no audio existed under the Hermes
  project tree at preflight.
- Maturity: `UNDERPOWERED` (<60 confirmed owner minutes).

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
| Distortions detected with correct word+type | >=20/25 | PENDING — no owner C1 recordings |
| False positives on normal sentences | <=10/50 | PENDING — no owner C1 recordings |
| Target alignment failures | <=5/75 design stop | PENDING |
| Phonikud target disagreements | <=2/25 | PENDING owner pronunciation review |
| Evidence maturity | >=60 min recommended | 3.421 min historical aggregate; 0 reusable raw |

## Current recommendation

**ITERATE / OWNER BENCHMARK REQUIRED.** The open-component pipeline is technically runnable and
the research design is preregistered, but there is no honest GO/NO-GO threshold verdict without
new local owner recordings. Synthetic TTS is excluded from the charter metric because it cannot
represent the owner's pronunciation or intentional stress/vowel errors.

Production planning is not authorized or started.

## What a later GO would require

Only after the frozen owner benchmark passes: repeat on fresh recordings, reach or explicitly
reassess the 60-minute maturity target, obtain an owner usefulness verdict on the actual localized
feedback, resolve the non-commercial/deprecated aligner dependency, then seek a separate owner
decision for production planning.
