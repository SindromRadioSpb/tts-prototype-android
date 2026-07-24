# Owner recording runbook

This is the remaining owner-live action for C1. It creates private research data locally; nothing
is uploaded.

1. Create `.tmp/h3-c1-owner-audio/`.
2. Open `benchmark_manifest.tsv` in a UTF-8-capable editor.
3. Record one mono WAV per row, preferably 16 kHz or 48 kHz, with the exact `audio_file` name.
4. For `NORMAL`, read the sentence naturally. For `DISTORTED`, read the same sentence but pronounce
   only `target_word` as shown in `spoken_target_vocalized`. Keep grammar, wording and pace normal.
5. Do not save a transcript, name or personal content in the file. These are fixed non-personal
   benchmark sentences.
6. Complete all 75 before running the scorer. Re-record only technical failures (clip/silence/noise
   interruption), not low scores.

Validate inventory without inspecting scores:

```powershell
.tmp/h3-c1-venv/Scripts/python.exe docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/prototype/c1_score.py validate-audio `
  --manifest docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv `
  --audio-dir .tmp/h3-c1-owner-audio
```

Then run the frozen scorer once:

```powershell
$env:TORCH_HOME = 'E:\projects\tts-prototype-android\.tmp\torch-cache'
.tmp/h3-c1-venv/Scripts/python.exe docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/prototype/c1_score.py score `
  --manifest docs/research/hermes-education-scaleup/rnd-c1-2026-07-24/benchmark_manifest.tsv `
  --audio-dir .tmp/h3-c1-owner-audio `
  --phonikud-model .tmp/phonikud-1.0.int8.onnx `
  --output-dir .tmp/h3-c1-results
```

Return only `.tmp/h3-c1-results/aggregate.json` to the Codex session. Do not paste audio,
transcripts or `details.json` into chat or git.
