# TTS Hebrew Quality Review

Дата: 2026-04-22

## Status

`QUALITY_ACCEPTABLE_FOR_EXPERIMENTAL`

Одновременно:

- `QUALITY_BETTER_THAN_SYSTEM_FALLBACK` — вероятно, но не подтверждено формальным manual listening в этом CLI spike
- `QUALITY_WORSE_THAN_ONLINE_TTS` — считать рабочей гипотезой до ручного A/B прослушивания

## What Was Actually Evaluated

- WAV generation succeeded for 8 real Hebrew phrases
- diacritics were added automatically
- phoneme output looked structurally plausible
- generation latency was low enough for a local sidecar experiment

## What Was Not Fully Evaluated

- manual listening by a Hebrew-speaking reviewer
- prosody, stress, and naturalness versus Google online TTS
- names, borrowings, and mixed Hebrew/English edge cases beyond one code path

## Provisional Scores

| Criterion | Score (0-5) | Note |
|---|---:|---|
| Sound generation reliability | 4 | No failures on smoke phrases |
| Latency | 4 | ~159 ms average total generation on smoke set |
| Naturalness | 3 | Not manually verified; assume below premium online path |
| Stress / niqqud handling | 3 | G2P looks plausible, but audio review still required |
| Product readiness | 1 | blocked by license, not by raw synthesis only |

## Recommendation

- Accept as an experimental research sidecar
- Do not position as a replacement for Google online Hebrew TTS
- Require manual listening review before any further investment in UX integration
