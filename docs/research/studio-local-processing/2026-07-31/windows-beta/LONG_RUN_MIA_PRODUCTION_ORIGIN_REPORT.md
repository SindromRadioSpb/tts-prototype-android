# Mia Schem production-origin Local ASR long run

Date: 2026-07-31
Served product: `https://linguistpro.kolosei.com`, `v3.11.272`
Disposition: **ENGINEERING PASS; NOT HUMAN-GOLD QUALITY PASS**

## Scope and route

The owner explicitly selected the local MP3
`Freed Israeli hostage Mia Schem in first interview since her release from Hamas captivity in Gaza.mp3`
and the production Library card `Заложница Миа. Интервью v2` for comparison.

Chrome first passed the real production-origin default-off enrollment, explicit Local selection,
pairing, and pinned-model readiness UI. Chrome-extension automation could not transfer the MP3
through the hidden native file chooser while DevTools retained the tab. The long job was therefore
submitted directly to the same loopback API with the mandatory header
`Origin: https://linguistpro.kolosei.com`. This proves the real media/decode lifecycle and the
production-origin allowlist together, but is not claimed as a browser file-chooser PASS.

The media was sent only to `http://127.0.0.1:8799`; no production server upload, Gemini request,
cloud quota, schema/data mutation, push, or deploy occurred.

## Immutable input and job

- Source bytes: `43,339,787`.
- Source duration: `1,805.81875 s` (`30:05.82`).
- Source SHA-256: `094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90`.
- Job: `aaa366ff-a62a-4272-ac40-e081724d94e9`.
- Terminal state: `COMPLETE`, `3/3` physical chunks, no retry.
- Actual provider: `local-faster-whisper`.
- Model revision: `72ad623a37947395efcc3933132353790e5a12f5`.
- `model.bin` SHA-256: `db2a2265aa012c16c7db9edda3d699c99f984efdd3f2e22a72a8ce7e9720f3a2`.
- Full large-v3 and fallback compute/model/decode policies were not used.

## Performance and integrity

- Sum of model chunk time: `66.54208 s`.
- Processing RTF: `0.0368487` (about `27.14x` realtime).
- Normalized output: `503` segments, `2,609` whitespace words.
- Normalization SHA-256: `ff0e333abe3615fa1692acf72e2f3580bb61d9ebc7e39cb78af1069ea298cbc5`.
- S12.5 physical integrity: `PASS`.
- S12.6 completeness/replay: `PASS`.
- S12.7 clock integrity: `PASS`.
- Coverage gaps, blind ranges, normalization warnings, OOM, thermal throttle: none.
- Duplicate four-gram ratio: `0.0265123`; no replay rejection.
- Peak observed GPU temperature: `62 C`.
- Minimum free VRAM: `3,636 MiB`.
- Peak power: `129.51 W`.

## Comparison with `Заложница Миа. Интервью v2`

The Library card is a shortened/adapted learning text, not an independent verbatim human
transcript. WER/CER against it would therefore be invalid and is not reported as model quality.

A bounded structural comparison found all `13/13` story anchors represented in the Local result:
reason for the interview; Nova; attack and escape; gunshot/hand injury; captivity in Gaza; surgery;
guarded family house; tunnels and other hostages; Red Cross release; guilt about people left behind;
hospital rehabilitation; epilepsy; closing message to remain strong.

Observed review candidates, not automatic grading:

- the Local transcript includes natural dialogue, narration, English phrases and detail omitted by
  the adapted card;
- it contains recognizable ASR substitutions around short/noisy phrases, including hand/injury
  wording and a name phrase near the opening narration;
- the final short chunk contains an out-of-context phrase after the interview closing, which should
  be checked against the audio boundary before owner acceptance;
- the currently rendered Russian card row for Hebrew `מיה עשתה את עצמה מתה` says that Mia killed
  herself, while the story and raw interview mean that she pretended to be dead. This is a card
  translation/content issue, not evidence of Local ASR failure.

The comparison supports semantic coverage for this one speaker/material, but does not close the
four-speaker beta human-gold gate or the permanent 60-minute/12-speaker paired-Gemini gate.

## Retention and next owner action

The raw result, source copy, physical chunks and manifests remain only in the user-local managed job
directory under `%LOCALAPPDATA%\LinguistPro\LocalASR\jobs\aaa366ff-a62a-4272-ac40-e081724d94e9`.
No transcript or media was committed. Keep this job until the owner completes listen/read review;
afterward use the Companion delete action and retain only the deletion receipt and aggregate metrics.
