# Proposed tutor MCP boundary v1

2026-09-29. This is a contract for the next implementation slice, not an enabled
tool or an OAuth grant. The existing browser tutor relay and Agent Access MCP are
different principals and consent paths.

## Additive discovery

`get_tutor_capabilities` is a new read-only tool with its own closed output
schema `aa.tutor_capabilities.1.0.0`. It may report supported schema versions,
available tutor operations and whether the current Agent Access connection has
the *new* grants. It returns no provider token, source text, question, answer,
profile or local-browser data. It must not add new enum values to the frozen
`get_agent_connection` output. The pinned connection capability version
`aa-v0.1` is not silently changed; the new tool advertises its own version.

Proposed OAuth scopes are distinct: `tutor.capabilities.read` for discovery,
`tutor.context.read` for one handoff context, `tutor.session.read` for one
session/result, and `tutor.artifact.propose` for a draft only. An existing
`personal.texts.content.read`, `explanations.body.read` or browser tutor consent
does not imply any of these scopes. A token, active connection, current grant
and matching versioned consent are checked on every call and on late result
acceptance. Revocation closes the reads and invalidates outstanding handoffs.

## Source handoff

`get_active_learning_context` accepts only a server-issued opaque `context_id`
with `schema_version=lp.tutor_context.1`. The user must explicitly issue a
single-context Agent Access handoff from the browser, bound to one connection,
account, source revision and expiry no longer than the existing tutor context
TTL. The server cannot discover an arbitrary open tab or OPFS source. The
response is a bounded source window with exact material/revision/sentence IDs,
caption revision and finite media interval only when verified, excerpt digest,
locale and expiry. Local-only source bytes exist only in the explicit handoff
snapshot. Reject stale revision, changed account, foreign connection and
missing/revoked handoff with typed refusals; never substitute a newer row.

`get_tutor_session` requires a session ID that belongs to the same account and
live handoff/connection. It returns a bounded result/receipt and proposal
state, not review grades or provider credentials. `propose_learning_artifact`
may submit a preview with source digest and idempotency key, but writes only a
pending proposal; canonical note/word/mastery/review writers remain behind a
separate first-party owner action. Model text is not independent editorial
review. Source-recall attempts use the existing deterministic first-party
checker and attempt-key semantics; no arbitrary `correct=true` MCP input.

## Acceptance before publication

- Contract tests for closed input/output schemas, output byte limits and
  cached `get_agent_connection` compatibility.
- Two-account/two-connection isolation, revoked/expired scope and handoff,
  replay, stale source and simultaneous-tab cases.
- Explicit owner consent UI and per-context audit without source text in logs.
- An actual Hermes `tools/list` and read call after deployment, followed by
  owner-chat acceptance separately. Until then no new tutor MCP tool is
  registered or advertised.
