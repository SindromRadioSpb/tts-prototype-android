# C2 Realtime Hebrew voice — evidence report

Date: 2026-07-25. Research status: **IN_PROGRESS / UNDERPOWERED**. Engineering state:
**ENGINEERING_COMPLETE**.

## Protocol

Frozen in `PREREGISTRATION.md` before any Gemini Live audio call. Three matched H2.6 async and
three Gemini Live realtime sessions, eight active minutes each. Primary threshold: mean realtime
valid user turns/minute divided by mean async confirmed turns/minute >=1.5. Every realtime session
must have verified actual cost USD 0.

Amendment A was frozen after a connection-only probe and before any audio session. It replaces the
terminal benchmark surface with Hermes WebUI on desktop/iPhone, removes owner anxiety and generic
quality ratings, and requires ephemeral input/output transcription on screen without persistence.

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
- The browser adapter streams microphone PCM to Gemini and plays returned PCM without creating an
  audio file. Input/output transcription is shown ephemerally and cleared at session end.
- The Gemini API key remains in the shared Hermes state volume. The broker reads the owner-only
  `.env` during startup, immediately drops to the unprivileged `hermeswebui` account, and then
  exposes only its loopback listener. It exchanges the key for a one-use, model-constrained
  ephemeral token through the authenticated, explicitly consented WebUI extension proxy.
- The UI and provider are separated by a browser `RealtimeVoiceProvider` contract; Gemini-specific
  WebSocket framing stays in `GeminiBrowserProvider`.
- Content-free result validation enforces the zero-cost cap after account verification, the three
  exact scenario cells per mode, duplicate rejection and the frozen 1.5x threshold.
- Focused checks after Amendment A: Node scorer 6/6 PASS, token-sidecar 7/7 PASS, browser JS,
  PowerShell and shell syntax PASS on 2026-07-25.
- One post-preregistration connection-only probe returned `PROBE_READY` for
  `gemini-3.1-flash-live-preview`. It sent no audio and is not a benchmark session.
- Provider-account billing confirmation for the connection-only probe is not available from the
  API response; the owner must verify the Free Tier project dashboard. No positive cost is assumed.
- Empty scorer gate: `INCOMPLETE`, 0/6 cells, with all six exact cells listed as missing.
- No MCP registration or LinguistPro learner-state path is involved. The R&D surface uses the
  administrator-controlled Hermes WebUI extension mechanism.
- Owner-executed bounded deployment PASS at `2026-07-25T07:07:13+03:00`: only `hermes-webui` was
  recreated from `linguistpro/hermes-webui-c2:20260725-1`; the retained rollback image is
  `linguistpro/hermes-webui-c1:20260724-1`. Candidate manifest-list digest:
  `sha256:ae3fe1016f4e205d1ef5c86d3e8c72c5366234b6aa7f524ed49f6ad7e6236680`.
- Post-restart WebUI evidence PASS: extension enabled, explicit sidecar-proxy consent persisted,
  proxy and sidecar health returned HTTP 200, and the sidecar reported `configured: true`.
  Opening the C2 surface produced no C2 console errors and requested neither microphone access nor
  a Gemini token.
- The required responsive capture is `evidence/c2-webui-380x844.png` (exact 380 x 844). Its panel
  has no horizontal overflow; all three frozen scenarios and the start control remain visible.
- Native Hermex remains the H2.6 async-control surface. Realtime RT2/RT3 must be run in iPhone
  Safari through the existing HTTPS tailnet origin; modifying/rebuilding the native app is outside
  this C2 slice.

## Benchmark result

Owner sessions pending. No numerical verdict is claimed before all six cells and billing checks
exist.

## Current recommendation

**CONTINUE R&D / OWNER BENCHMARK REQUIRED.** This is not a production GO.
