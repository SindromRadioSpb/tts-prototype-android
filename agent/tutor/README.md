# Tutor session transport — M1

`context.js` binds an immutable, bounded source snapshot to authenticated user,
connection, consent revision and session. The digest detects source changes; it
is not an authorization proof. `store.js` rechecks these bindings on delivery,
heartbeat, read and result using canonical SQLite state.

`routes.js` mounts `/api/tutor/*`: existing browser cookie/CSRF authorization,
one-time pairing, outbound bearer connector, idempotent sessions, cancellation,
revocation and version cursors. `TUTOR_BYOA_ENABLED=1` is required; default is off.
Migration: `070_tutor_transport.sql`. Response contract: `response.js` accepts only
bounded text or typed error for the exact context/digest. No model state writes.

Studio and Room host adapters capture the visible row synchronously. Revision is
a digest of the selected window, not a verified server corpus edition. All M1
inputs are labelled `local_snapshot`, including a displayed public text. The UI
shows the source and optional neighbours and requires explicit transmission consent.
HTML is displayed literally. Personal learner data/credentials are not inferred
from model output or accepted as client authority.

Context expires after 15 minutes; queued work after 30 seconds without delivery;
active work has a 30-second renewed lease and 180-second absolute deadline.
Periodic sweeps delete expired content (SQLite backup/physical erasure policy is
an operations concern). One active request and at most 30 retained sessions per
user bound the spike. An uncertain inference is never redelivered automatically.

See [connector setup](../../ops/mentor-connector/README.md) and
[M1 evidence](../../docs/research/mentor-byoa/2026-09-29/M1_IMPLEMENTATION.md).
Trusted server-source resolvers, graded educational cycles, installer, additional
MCP capabilities and mass-launch operations remain separate staged work.

## M2 source recall

`practice.js` derives an exact-source recall item after a completed explanation.
Migration 071 retains one masked challenge/attempt/receipt per session. Browser
cookie+CSRF routes `/sessions/:id/practice`, `/hint`, `/attempt` recheck binding
and TTL. Source-match is advisory: vowels are ignored, hint exposure is retained,
semantic alternatives are not graded, canonical review/FSRS is never written.
See [M2 evidence](../../docs/research/mentor-byoa/2026-09-29/M2_IMPLEMENTATION.md).
