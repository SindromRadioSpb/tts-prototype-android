# M4 continuation: explanation archive and practice proposal

Date: 2026-09-29. Branch: `feat/mentor-byoa-m4`. Candidate shell: 3.11.697.
This is a local owner-pilot increment; it is not production or owner-video acceptance.

## Implemented

- An explicitly accepted explanation retains its source kind, material/revision/sentence
  identity, excerpt, question and answer in the existing per-account local archive.
  The full Studio library ZIP now contains `personal/tutor-explanations.json` and a
  manifest status/count/schema when the account is signed in. A signed-out ZIP
  records `not_included` and warns in the export UI.
- The archive also offers a standalone JSON export/import and delete-all control.
  Restore validates every record before writing, checks the account identity,
  deduplicates by content, enforces the 50-record bound transactionally, and
  requires an explicit choice. A ZIP with another account's archive does not
  rebind it. Existing ZIPs without this optional member remain valid.
- A source-recall exercise is now a deterministic proposal made after the
  explanation. `proposed → accepted → completed` and `proposed → dismissed` are
  persisted in `tutor_practice`; cancel returns an accepted, unanswered proposal
  to `proposed`. Repeated accept/cancel/dismiss and attempt keys are idempotent.
  An answer from the model does not grade the exercise. The existing exact-source
  comparison is the only checker; canonical review/mastery writers are untouched.
- Migration 073 marks pre-existing unfinished practice `accepted` and existing
  receipts `completed`, preserving their prior availability/result. Practice
  rows remain bound to their original session and
  cascade on account deletion through the existing user/session foreign keys.

The Studio ZIP is a local library export, separate from the server's
`/api/account/export`. The server export now includes session-bound
`tutor_practice` rows and strips tutor token, pairing, enrollment and
idempotency hashes. Server account deletion explicitly removes practice before
the user-scoped sweep, including if SQLite foreign keys are unavailable. The
server still cannot read this device's IndexedDB archive or erase another
device's browser storage; the archive exposes explicit local export/delete.
A unified user-facing account workflow and owner acceptance remain.

## MCP boundary

No new MCP capability was published. [Versioned next-slice contract](M4_TUTOR_MCP_CONTRACT.md).
`get_agent_connection` in
`agent/access/mcpSchemas.js` has a frozen 15-scope output enum, while
`productionHandlers.js` deliberately filters newer grants. Adding tutor scopes
to that old result would break cached clients. The next MCP slice needs its own
versioned input/output schema, named read/write scopes, owner consent for each
source and retained artifact, account/revision checks, revoke behavior, typed
errors, and a two-account isolation test before any tool appears in `tools/list`.
The tutor browser connection and its transmission consent are not an Agent Access
MCP grant.

## Verification and limits

- 46 Node checks, 233 i18n checks and JS syntax/shell-integrity parity pass.
- Isolated browser smoke with four surfaces and practice passes, including ZIP
  archive member, bulk delete, cross-account/duplicate/atomic restore and cancel.
  A repeated run exposed an early-cancel click ignored during practice load;
  the control is now disabled until loading finishes, and the same scenario
  passed on rerun. [Practice result](M4_NEXT_BROWSER_RESULT.json) and
  [ZIP/archive result](M4_NEXT_ZIP_RESULT.json) both have empty `pageErrors`.
  [Mobile archive and practice screenshots](m4-next-screenshots/).
- The existing 23-check Reading Room training guard passed before the final
  identity recheck, which does not touch its writer.
- Full-schema two-account tutor export/delete smoke passed; existing CP0 and
  Agent Access OAuth lifecycle smokes remained green.
- An initial computer-use connection failed (`Debugger unattached`), then
  [Kapture owner-live evidence](M4_OWNER_VIDEO_LIVE.md) verified a real
  YouTube item, selected caption window, pause and retained playback position
  on the existing production pilot. Automated fixtures and this one live item
  are distinct evidence. Physical device and assistive-technology acceptance
  are also separate.

The next dependent work is unified server-account export/delete behavior and a
versioned tutor MCP contract. Keep global rollout closed until the corresponding
consent, quality and operations gates pass.
