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
  The user previews and consents to transmission. Neighbours over 4,000 characters
  are omitted. The whole server envelope is bounded to 24 KiB and expires in 15 minutes.
- Provider OAuth remains in the owner's runtime. Relay stores hashes of connector
  credentials. A new pairing replaces the old connection; revoke deletes its jobs.
- The runner uses an isolated temporary home, no tools/MCP, no learner writes,
  no owner memory, no auxiliary providers and no paid API fallback. Existing owner
  Hermes MCP access remains separate; expanding tutor tools requires M2+ contracts.
- A request is never automatically regenerated after an uncertain disconnect.
  Delivery of the same completed result can retry. SQLite retains session state
  across relay restarts. The browser stores only a session reference.
- Stop/revoke rejects late results; the worker stops on its next heartbeat
  (normally within 5 seconds, plus network timeout). Already accepted provider
  work cannot be guaranteed unconsumed.
- This is text explanation, not graded practice, durable educational artifacts,
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
