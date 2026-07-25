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
- `prototype/` — one-off provider-neutral CLI and content-free scorer;
- `REPORT.md` — evidence report, updated only with aggregate results.

Raw audio and transcripts are never written by the prototype. Per-session content-free metrics
go to `.tmp/h3-c2-results/`, which is gitignored. API keys remain in environment variables and
must never be copied into this repository.

Source HEAD before preregistration: `a021080138cd9ac7682e7e0de6f423b2c812b860` (`main`).

## Prototype commands

```powershell
node prototype/c2-session.mjs --list-devices
powershell -ExecutionPolicy Bypass -File prototype/start-realtime.ps1 -Scenario cafe -Device "MICROPHONE NAME"
node prototype/record-async.mjs --scenario cafe --turns 6 --duration-sec 480 --anxiety 3 --quality 4 --actual-cost-usd 0
node prototype/score-benchmark.mjs
node --test prototype/test/*.test.mjs
```

The prototype intentionally has no production entry point, no MCP registration and no connection
to LinguistPro learner state.

Protocol references: [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities),
[raw WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket), and
[session management](https://ai.google.dev/gemini-api/docs/live-api/session-management).
