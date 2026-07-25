# C2 Realtime Hebrew voice — evidence report

Date: 2026-07-25. Research status: **INCOMPLETE / UNDERPOWERED**. Experimental product state:
**DEPLOYED / OWNER-ENABLED**.

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
- Focused checks after productization: Node scorer 6/6 PASS, token-sidecar 9/9 PASS, browser JS,
  PowerShell and shell syntax PASS on 2026-07-25.
- The first deployed token request was rejected with provider HTTP 400 because the broker used
  the obsolete `liveConnectConstraints` AuthToken field. The same configured API key minted a
  one-use token after the request was moved to the current `v1alpha` AuthToken schema with
  `fieldMask: model` and `bidiGenerateContentSetup.model`; no replacement key is required.
- A second connection-only defect was found before owner audio: Gemini returned `setupComplete` as
  a binary WebSocket frame, while the browser adapter only parsed string JSON. The adapter now
  decodes `Blob`, `ArrayBuffer` and typed-array frames before parsing JSON.
- Post-repair live verification through the deployed authenticated WebUI proxy returned token HTTP
  200 and `setupComplete` from the constrained `v1alpha` WebSocket using the full production setup.
  The probe recorded `audioSent: false`; it is not a benchmark session and consumed none of
  RT1–RT3.
- The research selector was retired after the owner accepted the two-surface smoke. The product
  exposes eight predefined topics on every device, selects free conversation by default and sends
  the chosen topic as a soft Live instruction. Gemini is explicitly told to follow natural topic
  changes rather than force the learner back.
- Product token issuance uses `purpose=practice`; product completion writes neither localStorage
  nor the frozen result endpoint. No custom/personal-text field exists. Audio and transcripts remain
  ephemeral, and the UI explicitly states that the feature is advisory-only and does not affect
  LinguistPro progress.
- Provider-account billing confirmation for the connection-only probe is not available from the
  API response; the owner must verify the Free Tier project dashboard. No positive cost is assumed.
- Frozen scorer status remains `INCOMPLETE`: the matched async cells and RT3 are absent. The owner
  productization decision is not represented as a numerical research GO.
- No MCP registration or LinguistPro learner-state path is involved. The R&D surface uses the
  administrator-controlled Hermes WebUI extension mechanism.
- Final bounded product deployment PASS at `2026-07-25T11:33:07+03:00`: only `hermes-webui` was
  recreated from `linguistpro/hermes-webui-c2:20260725-1`; the retained rollback image is
  `linguistpro/hermes-webui-c1:20260724-1`. Candidate manifest-list digest:
  `sha256:daa11bb3bfd32bf5b14a32f890faa06ca86e3145fa280be8c5221042f142c7ad`.
- Post-restart WebUI evidence PASS: extension enabled, explicit sidecar-proxy consent persisted,
  proxy and sidecar health returned HTTP 200, and the sidecar reported `configured: true`.
  Opening the C2 surface produced no C2 console errors and requested neither microphone access nor
  a Gemini token.
- Final live product UI verification passed at desktop 1920 x 855 and mobile 390 x 844: eight
  topics, dynamic Hebrew+Latin starter, no horizontal overflow, hidden pre-start transcripts,
  no console errors and no microphone activation. The product token endpoint returned HTTP 200
  without exposing the token value or sending audio.
- Native Hermex remains the H2.6 async-control surface. Realtime RT2/RT3 must be run in iPhone
  Safari through the existing HTTPS tailnet origin; modifying/rebuilding the native app is outside
  this C2 slice.

## Benchmark result

The owner completed two content-free realtime observations:

- RT1 desktop/cafe: 69 seconds, 8 completed model turns, 0 breakdowns, 0 transport incidents;
- RT2 iPhone/directions: 95 seconds, 4 completed model turns, 0 breakdowns, 0 transport incidents.

The owner declared the temporary cross-device benchmark/smoke successful and authorized the mature
experimental product surface. RT3 and the three matched async cells do not exist, so the frozen
scientific benchmark remains `INCOMPLETE / UNDERPOWERED` and has no claimed ratio or GO verdict.

## Current recommendation

**CONTINUE EXPERIMENTAL PRODUCT / RESEARCH RESULT REMAINS INCOMPLETE.** Product use is normal
practice, not an RT1–RT3 observation. Free Tier billing and quota remain operational guardrails.
