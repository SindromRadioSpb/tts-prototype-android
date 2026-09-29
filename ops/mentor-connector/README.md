# M1 personal tutor connector

Operator-only transport spike, not the M3 consumer installer. Tested with Linux
inside owner Hermes 0.21.5 / f97608f1. No inbound port or OpenAI API key is needed.
The existing Hermes ChatGPT/Codex OAuth login must already work.

## Setup on an isolated LinguistPro instance

1. Apply normal server migrations (including `070_tutor_transport.sql`) and set
   `TUTOR_BYOA_ENABLED=1`. Default is disabled; production was not changed.
2. Start LinguistPro, sign in, open a sentence's explanation in Studio or Room.
   Expand “Подключить личного агента” and create a five-minute pairing code.
3. In the Linux Hermes environment, use its Python and a private credentials path:

```sh
python connector.py --origin https://YOUR-LINGUISTPRO-HOST --credentials /PRIVATE/tutor.json --pair
```

Enter the code on stdin. Do not put it in shell history. Then keep the connector running:

```sh
HERMES_HOME=/home/hermes/.hermes python connector.py --origin https://YOUR-LINGUISTPRO-HOST --credentials /PRIVATE/tutor.json -- /opt/hermes/.venv/bin/python /ABSOLUTE/hermes_turn.py
```

Use actual paths in the Hermes environment. Token file permissions must be 0600;
the parent directory must be private. Native Windows ACL management and autostart
are M3 work; do not present this operator flow as supported novice onboarding.
`--allow-local` permits HTTP only on the explicitly allowed loopback/Docker host
names for fixture tests. HTTPS is required otherwise. Redirects are rejected.

## Boundaries

- Only a selected snapshot, its adjacent sentences and question reach the runner.
  The user sees the scope before asking. A bounded history of up to four turns
  from the same source may accompany a follow-up. Neighbours over 4,000 characters
  are omitted. The whole server envelope is bounded to 24 KiB and expires in 15 minutes.
- Provider OAuth remains in the owner's runtime. Relay stores hashes of connector
  credentials. A new pairing replaces the old connection; revoke deletes its jobs.
- The runner uses an isolated temporary home, no tools/MCP, no learner writes,
  no owner memory, no auxiliary providers and no paid API fallback. Existing owner
  Hermes MCP access remains separate; expanding tutor tools requires M2+ contracts.
- A request is never automatically regenerated after an uncertain disconnect.
  Delivery of the same completed result can retry. SQLite retains session state
  across relay restarts. The browser keeps a session reference and an account-scoped
  local copy of completed conversation turns.
- Stop/revoke rejects late results; the worker stops on its next heartbeat
  (normally within 5 seconds, plus network timeout). Already accepted provider
  work cannot be guaranteed unconsumed.
- Completed conversations are saved in this browser's account-scoped local history;
  account data controls handle export/restore/deletion. This is text explanation, not graded practice,
  synced educational artifacts,
  grammar mastery, voice, or evidence of learning effectiveness.

## Checks

```sh
node --test tests/tutorContext.test.js tests/tutorTransport.test.js
node scripts/premium/tutor-m1-browser-smoke.js
python ops/mentor-connector/test_connector.py
```

Opt-in owner subscription test: `node scripts/premium/tutor-m1-live-smoke.js --owner-codex`.
It requires the scripts already copied to `/tmp/lp-tutor-m1` in the owner container;
it uses a synthetic authored sentence and an isolated relay, then revokes its token.
It consumes subscription allowance; never run as a routine CI test.
# Windows owner pilot (M3)

Build on Windows with Inno Setup 6:
`powershell -NoProfile -File ops/mentor-connector/windows/build.ps1`.
The `.tmp/tutor-installer/` manifest records the artifact SHA256. Distribute only
through the rollout-gated `/api/tutor/downloads` endpoint for this unsigned pilot.
The beta.4 executable and SHA-256 manifest are pinned under `releases/` so a
fresh deployment serves the matching helper immediately; the endpoint still
requires a signed-in pilot account.
The installer needs no administrator permission. Windows may warn because the
pilot has no signing certificate; do not disable Windows security controls.

Prerequisite: the supported pinned Hermes 0.21.5 Docker runtime, named home/source
volumes, configured ChatGPT/Codex subscription and Docker Desktop running.
Fresh-machine Hermes installation is a later slice, not handled by this installer.

Open **LinguistPro Tutor → Подключить**. The helper checks the subscription route
without inference, launches its outbound connector and opens the browser approval.
Sign in to LinguistPro, review the agent and confirm. No key or code copy is needed.
Close the helper window to keep working in the background; **Остановить** stops
the connector. Revoke access on `/tutor-connect.html` to invalidate its credential.
After a failed/expired approval, explicitly start Connect again.

To add the four tutor tools to the existing Hermes chat, install pilot helper
`0.1.0-beta.4` and choose **Подключить чат с наставником**. The helper prepares
a separate `linguistpro_tutor` MCP profile and opens a short browser consent
screen. Its local callback bridges the browser to Hermes inside Docker without
copying a code. The existing `linguistpro` profile and grants stay intact.
After a completed in-app explanation, **Продолжить в чате Hermes** copies a
short-lived, single-fragment handoff message; open chat and paste it. The chat
may read only that fragment and answer and can propose a note for owner review.
The helper needs a running Hermes 0.21.5 container with the existing owner MCP
profile. A newly installed Hermes without that profile is not yet supported.

Operator commands inside the deployed application:
`node ops/mentor-connector/rollout-cli.js enable-owner` (seven days),
`node ops/mentor-connector/rollout-cli.js disable-owner`.
They require exactly one configured `AGENT_ACCESS_OWNER_IDS` identity. Never
enable the global flag to emulate a bounded pilot. Emergency off overrides grants.

Uninstall removes the helper/protocol/shortcuts, attempts server revoke, and
removes only `linguistpro-tutor` plus its own two state files. Hermes history,
OAuth, gateway, source and home volumes are retained. With Docker unavailable,
revoke in the browser; offline uninstall recovery remains a public-release gate.
