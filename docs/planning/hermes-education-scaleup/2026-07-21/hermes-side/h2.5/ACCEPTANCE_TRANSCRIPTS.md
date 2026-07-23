# H2.5 acceptance transcripts

Дата: 2026-07-24. Model:
`ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`;
CPU int8, 6 threads, concurrency 1.

All audio below is synthetic engineering material generated locally with Microsoft Asaf `he-IL`.
No fixture contains owner speech or personal text. Full transcript content never entered wrapper
logs.

## Discovery and health

`hermes mcp list` after the two-container restart:

```text
ivrit_asr  /bin/sh -lc exec "${HERME...  1 selected  enabled
```

Direct MCP initialize/list-tools over the installed stdio command returned exactly:

```text
TOOLS ['transcribe_audio']
```

The host health check returned localhost OK, Tailscale OK and
`ivrit_asr -> one tool; runtime/model/inbox ready`.

## A — clean Hebrew audio

30.0 seconds; elapsed 49.065s; RTF 1.635; 10 segments; minimum `avg_logprob -0.085171`;
all `confidence:NORMAL`.

Transcript (the synthetic source repeats once):

```text
שלום, היום אנחנו בודקים מערכת מקומית לזיהוי דיבור בעברית. זהו טקסט ניסוי פשוט עם
משפטים ברורים וקצב דיבור רגיל. התוצאה היא השערה בלבד, ולכן צריך לקרוא אותה ולתקן
טעויות אם יש.
```

Result included `asr.transcribe.1.0.0`, timestamped segments, exact model revision and
`ASR_HYPOTHESIS_NOT_GROUND_TRUTH`. Raw file was absent after success.

Verdict: **PASS**.

## B — noisy Hebrew audio and LOW markers

30.0 seconds with deterministic 0 dB Gaussian noise; final installed policy elapsed 49.100s,
RTF 1.637. All 10 segments had `avg_logprob -0.154207` and were marked `confidence:LOW`.
The recognizer visibly changed `בעברית` to `ועברית` and `וקצב` to `בקצב`; these errors remain
visible as hypothesis errors and are not treated as learner pronunciation errors.

Result retained `ASR_HYPOTHESIS_NOT_GROUND_TRUTH`; raw file was absent after success.

Verdict: **PASS**.

## C — empty input

Actual MCP call:

```text
isError=true
ASR_EMPTY_FILE: audio file is empty
```

Raw fixture remained after the failed call and was removed manually after evidence capture.

Verdict: **PASS**.

## D — path outside voice-inbox

Actual MCP call using an existing non-inbox workspace file:

```text
isError=true
ASR_PATH_OUTSIDE_INBOX: file must resolve inside voice-inbox
```

The source was not opened, changed or removed.

Verdict: **PASS**.

## E — protocol result and raw deletion

A separate 6.113s clean WAV was sent through MCP initialize → list-tools → call-tool, not by a
direct function shortcut. It returned two timestamped segments and exact text:

```text
שלום, זהו מבחן של כלי מקומי. התמלול הוא השערה ולא אמת מוחלטת.
```

`isError:false`; elapsed 17.270s including cold model load; the raw path no longer existed after
the result. Schema, model revision and confidence note matched the contract.

Verdict: **PASS**.

## Additional corrupt-input gate

A nonempty 19-byte non-audio file exercised the real PyAV decoder and returned:

```text
ASR_INVALID_AUDIO: audio could not be decoded or transcribed
RAW_PRESERVED true
```

Wrapper log recorded only `error_type=InvalidDataError`, not the path or contents.

An adversarial swap test replaced an already-open fixture during inference. The final wrapper
returned `ASR_INPUT_CHANGED`, did not unlink the replacement and logged no path/content. Unit smoke
including this race is **7/7 PASS**. A final real 3.604s WAV through the hardened descriptor path
returned the exact synthetic sentence and was deleted after success.

## Benchmark summary

The required 120s normal fixture completed in 167.213s (RTF 1.393), 41 segments. The final short
segment had `avg_logprob -0.635177`, which the final installed threshold marks LOW. The benchmark
was run in one process so only the first sample paid model cold-load cost.

Acceptance: **5/5 PASS**, plus corrupt-input PASS. All successful raw files were deleted and all
failed raw files were preserved until manual fixture cleanup.

## Fresh ordinary WebUI session and owner-live

Fresh WebUI-owned session: `b0d167bc15b5`. The authenticated `/api/session/new` → ordinary chat
path was exercised after restart. Before it could answer the discovery prompt, the configured
Gemini provider returned `HTTP 429 RESOURCE_EXHAUSTED` for the free-tier input-token quota. No
immediate retry was made and no provider/cloud-STT fallback was added.

Owner-live is therefore pending: in a new ordinary WebUI chat, attach/place one real Hebrew voice
recording in `G:\HERMES_AGENT\voice-inbox\`, ask Hermes to call
`mcp__ivrit_asr__transcribe_audio`, confirm or correct the hypothesis, and record readability.
