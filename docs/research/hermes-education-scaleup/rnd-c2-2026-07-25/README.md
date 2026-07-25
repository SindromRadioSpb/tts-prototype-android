# C2 Realtime Hebrew voice R&D

Research status: **IN_PROGRESS / UNDERPOWERED**.

This directory contains a preregistered, non-production experiment comparing three matched
asynchronous H2.6 voice sessions with three Gemini Live realtime sessions. The owner authorized
Gemini Live Free Tier on 2026-07-25 with a hard budget of **USD 0/week**, no paid fallback, and
explicit consent for the six-session research protocol. Personal texts are excluded.

Main files:

- `PREREGISTRATION.md` — frozen protocol, metrics, thresholds and stop conditions;
- `ADVERSARIAL_DESIGN_REVIEW.md` — R2/R4/R12/R15/R16/R17 critique completed before code;
- `OWNER_RUNBOOK_RU.md` — exact human-readable owner procedure;
- `prototype/webui-extension/` — Hermes WebUI extension used on desktop and iPhone browsers;
- `prototype/token-sidecar/` — loopback broker that keeps the Gemini key server-side and issues
  one-use ephemeral tokens;
- the original CLI remains a provider conformance probe and cannot record benchmark sessions;
- `REPORT.md` — evidence report, updated only with aggregate results;
- `evidence/c2-webui-380x844.png` — exact-width responsive UI gate captured before any audio run.

Raw audio and transcripts are never written by the prototype. The WebUI shows provider input and
output transcription only while the conversation is open. Content-free metrics are stored in the
Hermes state volume under `webui/c2-live-results/`; the billing field remains unset until one
account-level Free Tier verification. API keys never reach the extension: the authenticated WebUI
proxy obtains a one-use ephemeral token from a loopback-only sidecar.

Source HEAD before preregistration: `a021080138cd9ac7682e7e0de6f423b2c812b860` (`main`).

## Engineering checks

```powershell
node --test prototype/test/*.test.mjs
python -m unittest discover -s prototype/token-sidecar -p "test_*.py" -v
node --check prototype/webui-extension/c2-live.js
```

The extension intentionally has no FSRS, grade, `review_log`, memory or LinguistPro learner-state
write. It is an opt-in R&D surface inside the self-hosted Hermes WebUI, not a public LinguistPro
production feature.

Protocol references: [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities),
[raw WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket), and
[ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), and the
[Hermes WebUI extension contract](https://github.com/nesquena/hermes-webui/blob/master/docs/EXTENSIONS.md).
