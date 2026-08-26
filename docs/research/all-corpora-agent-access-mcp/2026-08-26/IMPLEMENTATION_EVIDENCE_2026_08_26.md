# All-Corpora Agent Access MCP — implementation evidence ledger

Date: 2026-08-26
Program: `ALL-CORPORA-AGENT-ACCESS-MCP-R`
Owner authority: all recommended decision-packet values approved 2026-08-26; start implementation
Starting commit: `d28f0cfdaac7b9cc0dc5e6bbd6fc0d8a81faf350`
Branch: `main`; matched `origin/main` at start
Dirty tree: yes before implementation; unrelated owner files are excluded from the allowlist
Production mutation authority: none in this implementation checkpoint

## Evidence classes

`CODE`, `LOCAL_TEST`, `TEMPORARY_DB`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `INFERENCE` remain separate. Terminal output is summarized here before checkpoint closure.

## Governing boundary

- Typed read-only tools first; Resources are additive and cannot become a second content service.
- Published-public namespace only. Group, personal, learner, review and forum truth are excluded.
- Existing Physics `AGENT_READ` facts are read, never rewritten.
- Study Songs agent rights require the new approved publication-rights writer and are not applied to production in this checkpoint.
- PDF/audio bytes remain direct first-party HTTPS; MCP returns descriptors only.
- OCR, LLM/provider calls, object storage, external fetch/preview and production deploy remain excluded.

## Gate ledger

| Gate | Status | Evidence |
|---|---|---|
| G0 owner approval formalized | PASS | Decision packet records approval and exact bundle |
| G1 legacy MCP baseline | PASS | Stale v1 coverage fixture corrected; green before feature integration |
| G2 red contracts | PASS | 10 publication-agent tests: absent deny, owner-only append facts, exact targets, rollback guard, HMAC cursors, Physics one-writer reuse, no external links/binary |
| G3 additive migration/service/tools | PASS LOCAL/TEMPORARY_DB | Migration 065, rights repo, five tools, canonical writer; real runner applied all 65 migrations to a temporary DB |
| G4 consent RU/EN/HE and transport compatibility | PASS ISOLATED; HOSTED CLIENTS PENDING | Official SDK v2 client proved legacy `2025-11-25` plus pinned modern `2026-07-28`; 380 px RU/EN/HE/RTL/keyboard browser smoke passed |
| G5 regression/security/restore | PASS FOR CHECKPOINT | OAuth, OIDC, control plane, publication/Physics, migration copy rehearsal and output contracts green; dependency audit recorded below |
| G6 production rollout | NOT AUTHORIZED | Requires separate preflight and rollout authority |

## Implemented boundary

- Five closed read tools: corpus list, item search, exact item metadata, first-party resource descriptors and a 20-row/16-KiB text window.
- Three separately consented OAuth scopes; consent version `agent-access-consent-v3` requires reconsent.
- SDK v2 exact pins: `@modelcontextprotocol/server@2.0.0`, `node@2.0.0`, dev client `2.0.0`; one stateless endpoint supports the frozen legacy and modern eras.
- Migration 065 extends the grant CHECK and adds publication-local append-only rights/events/idempotency. Absent rights deny; down migration refuses to discard rights facts or active new grants.
- The canonical Study Songs writer is dry-run by default, requires exact current edition + manifest hash + owner role and splits the approved 309-fact production plan into bounded idempotent batches. It was exercised only on a temporary fixture.
- Physics does not receive duplicate rights: discovery reuses its existing exact-edition `PUBLIC_READ` and `AGENT_READ` facts.
- MCP returns first-party PDF/audio descriptors only. Binary/base64, packages, derivatives, external links, redirects, fetch/preview, OCR and all writes remain absent.

## Evidence executed

| Class | Command / observation | Result |
|---|---|---|
| `LOCAL_TEST` | `node --test tests/publicationAgentAccess.test.js` | PASS 10/10 |
| `LOCAL_TEST` | publication + Study Songs + Physics + agent suites | PASS 28/28 |
| `ISOLATED_AUTOMATION` | `npm run smoke:agent-access:mcp` | PASS 74 checks, 30 tools, both protocol eras, zero external/provider/live reads |
| `LOCAL_TEST` | domain / production handlers / consent | PASS 55 / 61 / 10 checks; zero writes/network/providers |
| `LOCAL_TEST` | OAuth lifecycle + restore, OIDC PKCE, control plane | PASS 24 + restore; 17 OIDC negatives; 54 control-plane checks |
| `TEMPORARY_DB` | real migration runner against an empty temporary DB | PASS; `065_publication_agent_access` recorded, 65 migrations applied |
| `TEMPORARY_DB` | migration rehearsal against a SQLite backup copy of `data/app.db` | PASS UP→DOWN→UP, integrity `ok`, 12 protected tables / 4 rows unchanged, source opened read-only |
| `ISOLATED_AUTOMATION` | publication consent browser | PASS at 380 CSS px, RU/EN/HE, RTL, keyboard focus, no horizontal overflow |
| `LOCAL_TEST` | `node --check` on changed server/repo/service/scripts | PASS |
| `LOCAL_TEST` | `npm ls` exact MCP packages | PASS, no invalid/extraneous dependency |

The repository has no `npm run build` script; syntax, targeted tests and isolated server/browser smokes are the applicable gates. The external two-client script stopped before a connection because `HERMES_AGENT_REPO` / a discoverable Hermes checkout with `uv.lock` was unavailable. Hosted Hermes, OpenAI, Inspector and Claude evidence therefore remains a rollout gate, not a claimed pass.

`npm audit --omit=dev` reported 18 production advisories (3 low, 6 moderate, 8 high, 1 critical). None is in the new MCP v2 package paths; affected existing chains include `sqlite3/node-gyp/tar`, `adm-zip`, `body-parser` and Google dependencies. No broad dependency upgrade was attempted inside this bounded program. This remains a separate remediation item before wider availability.

## Source and data write ledger

```text
RUNTIME_CODE=LOCAL_ONLY
MIGRATION=TEMPORARY_DB_ONLY
OWNER_DATA_WRITES=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
```

The local `data/app.db` source used for rehearsal was opened `READ_ONLY`; all migration writes occurred on a disposable SQLite backup copy. No account, connection, grant, consent, publication pointer, Physics right, Study Songs right or learner/group truth was created in owner or production data.

## Scoped implementation allowlist

Runtime/domain: `agent/access/{capabilities,consentCeremony,contracts,mcpAdapter,mcpRateLimiter,mcpSchemas,oauthContracts,productionHandlers,publicPublicationReadService}.js`, `agent/controlPlane/scenarioRegistry.js`, `db/publicationAgentRightsRepo.js`, `server.js`.

Schema/ops/tests: `migrations/065_publication_agent_access.sql`, matching down migration, the two new premium scripts, MCP/domain/UI fixtures, `tests/publicationAgentAccess.test.js`, package manifests, Agent Access HTML/JS and these program docs.

Explicitly untouched: publication/Physics pointers and files; learner, review, notes, bookmarks, group and Telegram writers; public corpus payloads; forum/solutions domain; production coordinates/config/flags/deployment.

## Remaining rollout gates

1. Fresh production preflight: `HEAD`, `origin/main`, served version, migrations, disk and backup/read-back — without applying migration 065.
2. Hosted client interoperability: MCP Inspector, Hermes, OpenAI Responses; Claude before wider availability.
3. Owner-only production migration after backup and exact rehearsal receipt.
4. Dry-run the Study Songs rights writer against the production copy; owner verifies edition/manifest/count/plan hash before `--apply`.
5. New consent and owner connection; flags remain off until the bounded window.
6. Owner-only Physics + Study Songs tasks, live revoke ≤60 seconds, content-free audit inspection and flags-off rollback.
7. Only after GO thresholds: bounded community availability. External-link descriptors, MCP Resources, OCR/derivatives and packages remain later approvals.
