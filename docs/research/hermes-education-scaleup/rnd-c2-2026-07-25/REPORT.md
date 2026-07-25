# C2 Realtime Hebrew voice — evidence report

Date: 2026-07-25. Research status: **IN_PROGRESS / UNDERPOWERED**.

## Protocol

Frozen in `PREREGISTRATION.md` before any Gemini Live audio call. Three matched H2.6 async and
three Gemini Live realtime sessions, eight active minutes each. Primary threshold: mean realtime
valid user turns/minute divided by mean async confirmed turns/minute >=1.5. Every realtime session
must have verified actual cost USD 0.

## Preflight

- H2.6 CLOSED; historical evidence is two sessions / 205.28 seconds / owner usefulness 5/5.
- Historical sessions do not contain turns/minute and are not primary benchmark cells.
- Four-week recommended baseline is absent; maturity is `UNDERPOWERED`.
- Owner authorization fixes Gemini Live Free Tier, USD 0/week, no paid fallback, cloud-audio
  consent for three preregistered sessions, no personal texts and explicit H2.6 fallback on 429.
- No active H1/H2 monitor stop condition affects C2.

## Engineering evidence

- Provider-neutral contract normalizes readiness, audio, completed turns, usage, quota exhaustion,
  typed errors and closure; Gemini-specific WebSocket messages stay inside one adapter.
- The Windows CLI streams 16 kHz PCM from ffmpeg directly to Gemini and 24 kHz PCM directly to
  ffplay. It has no raw-audio or transcript file path and input/output transcription is disabled.
- Content-free result validation enforces the zero-cost cap, the three exact scenario cells per
  mode, ratings bounds, duplicate rejection and the frozen 1.5x threshold.
- Focused Node tests: 6/6 PASS on 2026-07-25.
- One post-preregistration connection-only probe returned `PROBE_READY` for
  `gemini-3.1-flash-live-preview`. It sent no audio and is not a benchmark session.
- Provider-account billing confirmation for the connection-only probe is not available from the
  API response; the owner must verify the Free Tier project dashboard. No positive cost is assumed.
- Empty scorer gate: `INCOMPLETE`, 0/6 cells, with all six exact cells listed as missing.
- No production code, MCP registration, LinguistPro learner-state path or deployment is in scope.

## Benchmark result

Owner sessions pending. No numerical verdict is claimed before all six cells and billing checks
exist.

## Current recommendation

**CONTINUE R&D / OWNER BENCHMARK REQUIRED.** This is not a production GO.
