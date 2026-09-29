# Tutor session foundation

`context.js` is the first server-side boundary of M1. It is not wired into
HTTP, MCP or the browser yet and does not itself authorize any request.

The host resolves an authenticated principal, connection, current consent
revision and session before constructing a context. Persist the returned
envelope in a trusted tenant-scoped store; later accept only its opaque ID,
not a client/LLM-supplied envelope. Re-read authorization at every delivery and
result, then call `assertContextAccess`. The digest detects accidental source
changes; it is not a MAC or an authorization proof.

The immutable snapshot binds material, exact revision, row, selected Unicode
code-point offsets, neighbour text and optional caption clock/revision. It
expires after 15 minutes and is limited to 24 KiB. Renewal must require a fresh
authorization decision. Source strings remain untrusted text: render as text,
never HTML, and pass to the runtime as learning material, never system policy.

Local OPFS data is explicitly labelled a user-supplied snapshot. This module
does not claim to verify it against a server corpus or convert it into learner
mastery, tools, scopes, grades or canonical state. Trusted server-source
resolvers and permission-aware browser adapters remain M1 work.

Check: `node --test tests/tutorContext.test.js`.
