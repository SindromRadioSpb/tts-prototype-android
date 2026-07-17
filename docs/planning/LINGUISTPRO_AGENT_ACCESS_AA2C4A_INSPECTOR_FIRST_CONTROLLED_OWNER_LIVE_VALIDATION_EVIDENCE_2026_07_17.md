# LinguistPro Agent Access AA2-C4A Inspector-first controlled owner-only live validation evidence

**Date:** 2026-07-17

**Status:** `INSPECTOR_OWNER_WINDOW_STOPPED_PRE_DISPATCH / FLAG_FIRST_ROLLBACK_COMPLETE / OWNER_ALLOWLIST_REMOVED / CLIENTS_GATE_OFF / MCP_GATE_OFF / ZERO_LIVE_AUTHORITY / HERMES_UNTOUCHED`.

**Packet commit:** `5601aeac5108122242e20c39c47653b61ed9a21d`.

**Production revision/package:** `e77241acb4fc1e8a0de58c2e7e2c05a41ada3cd3` / `3.11.197`.

This record is content-safe. It contains no owner, user, subject, connection, grant, token or authorization-code value; no cookie, PKCE, state, CSRF or request header; no private operations coordinate; and no learner aggregate, title, author, explanation, construct or source payload.

## 1. Authorized execution and preflight

The owner approved packet §16 for exact packet commit `5601aea`, exact deployed revision `e77241a`, package `3.11.197`, Inspector `0.22.0`, one owner-only bounded window, exact flag sequence, one allowed pre-dispatch retry, flag-first rollback and content-safe evidence. Hermes/AA2-C4B remained prohibited.

Preflight confirmed:

- local branch and packet commit exact; production/main revision exact; package and lock exact;
- packet-required local Agent Access OAuth/MCP/consent/deployment/restore/two-client regressions green;
- `/healthz` ready; DB and migrations ready;
- exact reviewed Inspector and Hermes public client rows initially `SUSPENDED`;
- OAuth clients and MCP gates off, owner allowlist absent, and lifecycle counts zero;
- one fresh nonempty backup increased the retained backup count from `10` to `11`;
- unrelated owner F1/F2/research and `.agents/` files were neither read for payload evidence nor staged.

No code, migration, schema, API, UI, scope, dependency or production revision changed during execution.

## 2. Bounded window timeline

1. Only the Inspector registry row was made `ACTIVE`; Hermes stayed `SUSPENDED`.
2. One exact opaque owner allowlist and MCP gate `1` were configured while the OAuth clients gate remained `0`; same-revision redeploy completed.
3. Fail-closed pre-window checks returned health `200`, metadata `200`, authorization/token/revocation/MCP client boundary `404`, and lifecycle total `0`.
4. The OAuth clients gate was set to `1`; same-revision redeploy completed with exact revision/package and lifecycle total `0`.
5. Inspector `0.22.0` was launched locally with an isolated browser tab and no prior OAuth token residue.
6. The first connection attempt failed before OAuth consent or MCP dispatch because Inspector supplied its empty default custom bearer header. The server rejected it fail-closed. Packet policy allowed one pre-dispatch retry.
7. The default header was removed and the exact approved client ID and five scopes were retained. The single permitted retry reached production authorization discovery but failed before consent.
8. No authorization code, connection, grant, token family, refresh token, consent record or learner-data response was created.
9. The mandatory flag-first rollback ran immediately and completed in packet order.

## 3. Root cause and exact blocker

Inspector `0.22.0` derives protected-resource metadata discovery from the configured MCP server URL. For `/agent-access/mcp` it first requests the path-scoped metadata location for `/agent-access/mcp`, then the root fallback. Production intentionally publishes the reviewed metadata at the resource location for `/agent-access`:

```text
published resource metadata class = /agent-access
Inspector-derived server path      = /agent-access/mcp
automatic discovery parity         = false
```

Both Inspector-derived discovery locations returned no usable metadata. Inspector silently fell back to origin-relative `/authorize`; that request did not carry the reviewed MCP resource binding and terminated on a deterministic error page. The production authorization endpoint itself remains `/oauth/auth` as advertised by the reviewed authorization-server metadata.

The server's bearer challenge does advertise the exact protected-resource metadata URL, but Inspector's configured OAuth path attempted discovery before a successful challenge-driven retry could establish that URL. The packet's one retry budget was exhausted. No additional connection attempt, custom URL workaround, route alias, DCR/CIMD, registration endpoint or schema relaxation was used.

This is a production-path interoperability blocker. Resolving it requires a separate bounded decision between an Inspector-supported explicit metadata configuration/sequence and a reviewed server discovery-route compatibility change. The latter is an API-route change and was outside C4A authority.

## 4. Calls not reached

Because execution stopped before consent and dispatch, the following planned live validations were **not** performed and are not claimed:

- owner consent ceremony;
- MCP `initialize`;
- `tools/list`;
- any of the five production handler calls;
- refresh rotation or token revocation;
- learner metadata/body-leak validation from live outputs.

Therefore this evidence is not production MCP readiness, five-handler live evidence, Hermes integration, learning evidence or product launch.

## 5. Flag-first rollback and cleanup

Rollback completed in the required order:

1. OAuth clients gate returned to exact `0`; same-revision redeploy completed.
2. Health stayed `200`; metadata stayed `200`; authorization, token, revocation and MCP returned `404` before lifecycle cleanup.
3. Inspector returned to `SUSPENDED`; Hermes remained `SUSPENDED`.
4. Lifecycle total was already `0`, so no connection existed to revoke or delete and no erasure tombstone was synthesized.
5. The isolated Inspector tab/profile was closed; the local Inspector process was stopped; the validated temporary scratch directory was removed.
6. MCP gate returned to exact `0`; the temporary owner allowlist was removed; clients gate stayed `0`; same-revision redeploy completed.
7. Final production revision/package remained exact `e77241a` / `3.11.197`.

## 6. Fifteen-minute observation

Fifteen one-minute health samples all returned HTTP `200`; elapsed observation time was greater than 15 minutes. The final content-safe DB matrix was:

| Authority/residue class | Count |
|---|---:|
| `ACTIVE` clients | 0 |
| pending/live connections | 0 |
| `ACTIVE` grants | 0 |
| `ACTIVE` authorization codes | 0 |
| `ACTIVE` token families | 0 |
| `ACTIVE` refresh tokens | 0 |
| access-token denials | 0 |
| subject mappings | 0 |
| connections, all statuses | 0 |
| Agent Access consent records | 0 |
| Agent Access erasure tombstones | 0 |
| content-safe Agent Access audit rows | 2 |

The two audit rows record the two pre-dispatch fail-closed attempts. They are non-authoritative bounded audit residue, not live access authority. No token-store value remained because no token was issued and the isolated Inspector tab/profile was destroyed.

## 7. Safety and R1-R17 disposition

- **R1/R3/R4/R6/R7/R8/R10/R13:** deterministic boundaries, public-metadata honesty, exact revision identity, backup readiness, flag-first rollback and do-no-harm remained authoritative; no failing live result was reclassified as success.
- **R2/R5:** synthetic or pre-dispatch client behavior is not learning value, Hermes integration, production MCP readiness or launch evidence.
- **R9/R12:** no external memory or MCP business-logic authority was created; no handler dispatched and no dual-write occurred.
- **R11/R17:** no external prose, evaluator, grade or evidence authority was invoked.
- **R14:** exact owner/client isolation held; Hermes was never configured or contacted; no connection existed.
- **R15:** metadata was minimized; no private learner body/source or identifier entered stdout/evidence. The deliberate audit residue is recorded separately from live authority.
- **R16:** provider/LLM/BYOK/polling calls and managed-LLM cost were zero. The only external traffic was the approved production health/OAuth/MCP boundary validation.

## 8. Required next decision

C4A remains blocked. Prepare a separate default-off Inspector discovery-compatibility repair/validation packet that:

- chooses one exact, reviewed metadata-discovery mechanism;
- preserves the canonical resource, authorization endpoint, five scopes and public-client model;
- adds no DCR/CIMD, client secret, shared bearer or token passthrough;
- proves the selected fix synthetically with Inspector `0.22.0` before any new live window;
- obtains separate code/deployment authority if an API-route compatibility change is selected;
- requires a new owner approval before any production flag, owner allowlist, client activation or live request.

AA2-C4B/Hermes remains prohibited until a later C4A window actually passes and is separately reviewed.
