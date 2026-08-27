# All-Corpora Agent Access MCP — implementation evidence ledger

Date: 2026-08-26
Program: `ALL-CORPORA-AGENT-ACCESS-MCP-R`
Owner authority: all recommended decision-packet values approved 2026-08-26; start implementation
Starting commit: `d28f0cfdaac7b9cc0dc5e6bbd6fc0d8a81faf350`
Branch: `main`; matched `origin/main` at start
Dirty tree: yes before implementation; unrelated owner files are excluded from the allowlist
Production rollout authority: owner-approved after the local checkpoint; bounded migration, Study Songs rights, deploy and verification only

## Evidence classes

`CODE`, `LOCAL_TEST`, `TEMPORARY_DB`, `ISOLATED_AUTOMATION`, `PRODUCTION_ANONYMOUS`, `OWNER_LIVE_READ_ONLY`, `OWNER_REPORTED`, `INFERENCE` remain separate. Terminal output is summarized here before checkpoint closure.

## Governing boundary

- Typed read-only tools first; Resources are additive and cannot become a second content service.
- Published-public namespace only. Group, personal, learner, review and forum truth are excluded.
- Existing Physics `AGENT_READ` facts are read, never rewritten.
- Study Songs agent rights were applied once through the approved publication-rights writer: 309 append-only facts in four idempotent batches.
- PDF/audio bytes remain direct first-party HTTPS; MCP returns descriptors only.
- OCR, LLM/provider calls, object storage and external fetch/preview remain excluded.

## Gate ledger

| Gate | Status | Evidence |
|---|---|---|
| G0 owner approval formalized | PASS | Decision packet records approval and exact bundle |
| G1 legacy MCP baseline | PASS | Stale v1 coverage fixture corrected; green before feature integration |
| G2 red contracts | PASS | 10 publication-agent tests: absent deny, owner-only append facts, exact targets, rollback guard, HMAC cursors, Physics one-writer reuse, no external links/binary |
| G3 additive migration/service/tools | PASS LOCAL/TEMPORARY_DB | Migration 065, rights repo, five tools, canonical writer; real runner applied all 65 migrations to a temporary DB |
| G4 consent RU/EN/HE and transport compatibility | PASS ISOLATED + OWNER-OPERATED HERMES; INSPECTOR/OPENAI PENDING | Official SDK v2 client proved legacy `2025-11-25` plus pinned modern `2026-07-28`; 380 px RU/EN/HE/RTL/keyboard browser smoke passed; owner reconsented to 26 scopes and Hermes discovered 30 tools |
| G5 regression/security/restore | PASS FOR CHECKPOINT | OAuth, OIDC, control plane, publication/Physics, migration copy rehearsal and output contracts green; dependency audit recorded below |
| G6 owner-only production rollout | OWNER_REPORTED PASS; OWNER-ONLY SLICE CLOSED | Migration 065, exact Study Songs rights, 3.11.443, live read-only service and 380 px browser passed; explicit consent v3 reconsent, five publication-tool calls and fresh-chat Hermes invocation passed |

## Implemented boundary

- Five closed read tools: corpus list, item search, exact item metadata, first-party resource descriptors and a 20-row/16-KiB text window.
- Three separately consented OAuth scopes; consent version `agent-access-consent-v3` requires reconsent.
- SDK v2 exact pins: `@modelcontextprotocol/server@2.0.0`, `node@2.0.0`, dev client `2.0.0`; one stateless endpoint supports the frozen legacy and modern eras.
- Migration 065 extends the grant CHECK and adds publication-local append-only rights/events/idempotency. Absent rights deny; down migration refuses to discard rights facts or active new grants.
- The canonical Study Songs writer remained dry-run by default, matched the exact current edition and manifest, and applied the approved 309-fact plan in four bounded idempotent batches. Read-back is 77 `DISCOVER=YES`, 77 `SOURCE_TEXT=YES`, 77 `SOURCE_BINARY=YES`, 77 `DERIVATIVE_TEXT=NO`, and one package `SOURCE_BINARY=NO`.
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
| `PRODUCTION_ANONYMOUS` | repeated `/api/client-config` and clean Reading Room at 380 px | PASS; stable `3.11.443` 5/5, correct footer/SW/cache, no cookie, `/api/auth/me` 401, no horizontal overflow |
| `PRODUCTION_ANONYMOUS` | Physics corpus UI and PDF viewer | PASS; nine chapter buttons total 74 tasks, chapter 1 filters to 10/10, PDF opens in the bounded full-height viewer with separate-open escape hatch |
| `OWNER_LIVE_READ_ONLY` | production service constructed over SQLite `OPEN_READONLY` | PASS; Physics 74 / one PDF descriptor and Study Songs 77 / audio descriptors / bounded text window |
| `OWNER_LIVE_READ_ONLY` | pre-rollout backup versus post-rollout online snapshot | PASS; 30 protected owner/learner/group/publication tables have identical row counts and content digests |
| `OWNER_LIVE_READ_ONLY` | OAuth/MCP discovery | PASS; three `reading.publication.*` scopes advertised; unauthenticated MCP initialize denied 401 |
| `OWNER_LIVE_READ_ONLY` | Hermes reconsent and discovery, 2026-08-27 | PASS; explicit consent selected 26 scopes and the owner-operated Hermes client discovered 30 tools |
| `OWNER_LIVE_READ_ONLY` | five publication tools through Hermes-compatible SDK | PASS; Physics edition 2 exposed 74 items / 394 assets and a task-bound PDF descriptor; Study Songs edition 2 exposed 77 items / 2,155 assets and a bounded two-row text window; content bodies were not copied into the evidence log |
| `OWNER_LIVE_READ_ONLY` | fresh ordinary Hermes WebUI chat | PASS; session `98a7214ca904` recorded `mcp__linguistpro__list_published_public_corpora` as `tool_complete` with `is_error:false` and returned the expected immutable corpus identifiers and counts |
| `OWNER_REPORTED` | owner acceptance, 2026-08-27 | PASS; owner reported that MCP was implemented and tested successfully |

The repository has no `npm run build` script; syntax, targeted tests and isolated server/browser smokes are the applicable gates. The earlier external two-client script stopped before a connection because `HERMES_AGENT_REPO` / a discoverable Hermes checkout with `uv.lock` was unavailable. That historical gap is now closed for the owner-operated Hermes client by the 2026-08-27 evidence above. OpenAI Responses and Inspector interoperability, live revoke/audit evidence, and Claude before wider launch remain gates, not claimed passes.

`npm audit --omit=dev` reported 18 production advisories (3 low, 6 moderate, 8 high, 1 critical). None is in the new MCP v2 package paths; affected existing chains include `sqlite3/node-gyp/tar`, `adm-zip`, `body-parser` and Google dependencies. No broad dependency upgrade was attempted inside this bounded program. This remains a separate remediation item before wider availability.

## Source and data write ledger

```text
RUNTIME_CODE=PRODUCTION_3.11.443
MIGRATION=065_APPLIED
OWNER_DATA_WRITES=STUDY_SONGS_AGENT_RIGHTS_ONLY_309_FACTS
PRODUCTION_WRITES=MIGRATION_065_AND_APPROVED_RIGHTS_ONLY
DEPLOY=PRODUCTION_3.11.443
```

Migration 065 was applied automatically by the production migration runner on the first feature deployment. The production backup passed archive read-back before the rights writer ran. The writer added exactly 309 facts, four events and four idempotency receipts. No account, connection, grant, consent, publication pointer, Physics right, learner/review/note/bookmark/group truth or public corpus payload was changed. A digest comparison across 30 protected tables against the pre-rollout backup found no differences.

Release commits were `3604c10a` (feature), `b7d2c1eb` (initial 3.11.441 marker), `528e79a6` (coherent 3.11.442 shell markers), and `33efb4c8` (3.11.443 rolling-update race fix). Owner report exposed that 3.11.441 served a 3.11.440 Room marker. The final fix keeps Studio, Room and SW at one release and refreshes `/api/client-config` immediately before a network fallback, preventing a rolling-deploy version captured in memory from becoming the next stale target.

The three production control gates needed for the existing owner-only Agent Access perimeter remain effectively open through the pre-existing audited owner control journal; no production environment variable or client row was changed in this rollout. Existing connections do not silently gain the new scopes: the owner must explicitly reconnect/reconsent to `agent-access-consent-v3` before exercising the five new tools.

That required ceremony was subsequently completed on 2026-08-27. The consent/connection changes belong to the separately authorized owner reconsent flow; they did not alter corpus, publication, learner, review, notes, bookmarks, group or forum truth. This documentation-only closure does not perform or authorize another consent write.

Three sequential release builds temporarily raised root-disk use to 95%. Under the owner's existing bounded-cleanup authority, seven unreferenced old application image tags were removed. Current 3.11.443 and immediate rollback 3.11.442 were retained; volumes, backup and build cache were untouched. Post-cleanup disk use is 87%.

## Scoped implementation allowlist

Runtime/domain: `agent/access/{capabilities,consentCeremony,contracts,mcpAdapter,mcpRateLimiter,mcpSchemas,oauthContracts,productionHandlers,publicPublicationReadService}.js`, `agent/controlPlane/scenarioRegistry.js`, `db/publicationAgentRightsRepo.js`, `server.js`.

Schema/ops/tests: `migrations/065_publication_agent_access.sql`, matching down migration, the two new premium scripts, MCP/domain/UI fixtures, `tests/publicationAgentAccess.test.js`, package manifests, Agent Access HTML/JS and these program docs.

Explicitly untouched: publication/Physics pointers and files; learner, review, notes, bookmarks, group and Telegram writers; public corpus payloads; forum/solutions domain; production configuration and environment flags.

## Owner-only slice closure — 2026-08-27

```text
OWNER_RECONSENT=PASS_26_SCOPES
HERMES_DISCOVERY=PASS_30_TOOLS
PUBLICATION_TOOL_CALLS=PASS_5_OF_5
FRESH_HERMES_CHAT_TOOL_INVOCATION=PASS
OWNER_ACCEPTANCE=OWNER_REPORTED_PASS
OWNER_ONLY_SLICE=CLOSED
RUNTIME_CODE_THIS_CLOSURE=NONE
MIGRATION_THIS_CLOSURE=NONE_EXECUTED
CORPUS_LEARNER_GROUP_WRITES_THIS_CLOSURE=NONE
PRODUCTION_DEPLOY_THIS_CLOSURE=NONE
WIDER_AVAILABILITY=NOT_APPROVED
```

The owner-only acceptance covers the existing read-only Physics and Study Songs publication contract through the owner-operated Hermes client. It does not broaden rights, enable writes, approve community access or establish general interoperability for every MCP client.

## Remaining post-closure gates

1. Prove Inspector and OpenAI Responses interoperability; prove Claude compatibility before wider launch.
2. Exercise and record live revoke propagation within 60 seconds and inspect the content-free audit trail without mutating corpus or learner truth.
3. Keep flags-off rollback available without deleting rights rows; immediate image rollback target remains 3.11.442.
4. Only after separate GO thresholds and owner approval: bounded community availability. External-link descriptors, MCP Resources, OCR/derivatives and packages remain later approvals.
