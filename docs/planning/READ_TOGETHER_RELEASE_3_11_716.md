# Read Together — release 3.11.716

## Authority and isolation

Owner authorized creation of the real connection and minimal access, then explicitly authorized GitHub push/deploy to linguistpro.kolosei.com with initial access only for their account. These approvals were relayed by the parent session.

Release worktree: `E:\projects\tts-prototype-android\.tmp\read-together-release`, branch `release/read-together`, freshly fetched base `origin/main=f13d4aab`. The completed local implementation was cherry-picked as `6c29f935`. Foreign Worlds and frozen Jerusalem worktrees are untouched. Shell APP_VERSION, CACHE_VERSION and Room footer are 3.11.716.

## Minimal authorization contract

- MCP URL: `https://linguistpro.kolosei.com/agent-access/read-together/mcp`.
- Discovery: `https://linguistpro.kolosei.com/.well-known/oauth-protected-resource/agent-access/read-together/mcp` advertises exactly `read_together.context.read read_together.action.propose`.
- Resource/audience remains `https://linguistpro.kolosei.com/agent-access`; issuer remains `https://linguistpro.kolosei.com/oauth`.
- Authorization URL: `https://linguistpro.kolosei.com/oauth/auth`; token URL: `https://linguistpro.kolosei.com/oauth/token`.
- Registration URL: empty (static custom public client); token auth method `none`; client secret empty. Default and base scopes contain only the two Read Together scopes above.
- Proposed public client ID: `linguistpro-dot-read-together-v1`. Use only the exact callback copied from the owner's open ChatGPT management form; no wildcard or additional redirects. The owner supplied that exact callback to the parent; it is not committed here.

New operator-approved static clients cannot request older scopes. Authorization rejects broadened scope requests, token issuance checks the client policy, and bearer verification independently rejects broad tokens before accessing the repository. MCP tool dispatch also verifies each tool's distinct scope. Minimal tokens list exactly three tools on general/read-together endpoints and zero on tutor; older tools remain denied even if called by name. Older Hermes/Inspector policies and grants remain unchanged.

New OAuth interactions and completion for approved reading clients require the exact configured owner account, before subject, connection or grant writes. The existing server MCP owner contract requires one concrete `AGENT_ACCESS_OWNER_IDS` entry; no wildcard. User/connection/session/version checks still apply to every reading call. Stop ends active context authority; OAuth connection retention never grants continuous or background access.

Migration `077_read_together_scopes.sql` expands the grant CHECK while copying all prior rows unchanged. No production grant, approved-client env profile, signing key, cookie key, audit key or production flag is created by deployment. Consent v6 remains compatible for old scopes; both new scopes require new explicit consent cards and retention acknowledgment.

## Registration and runtime configuration

The operator must configure exactly one new public profile in `AGENT_ACCESS_OAUTH_APPROVED_CLIENTS_JSON` and an exact matching `agent_oauth_clients` row. Profile fields: client_id/name, software_id/version, `token_endpoint_auth_method=none`, `grant_types=[authorization_code,refresh_token]`, `response_types=[code]`, and the single confirmed HTTPS callback. No client secret is used. Existing default clients are retained automatically.

This configuration is separate from publishing code. Existing secret custody must be checked privately; absent signing/cookie/audit keys require protected owner input, never plaintext in chat or Git. The OAuth provider requires UI/OAuth flags and exact trusted proxy configuration; clients/MCP remain default-off until an approved, bounded owner access window is deliberately opened. The user completes interactive consent themselves. Creating a row alone creates no grant and does not make an endpoint active.

## Verification and rollback

Commands: `npm test`; `node --test tests/readTogether*.test.js tests/approvedClients.test.js`; `npm run smoke:agent-access:mcp`; `npm run smoke:agent-access:oauth-deployment`; `npm run smoke:agent-access:production-handlers`; `node scripts/premium/read-together-browser-smoke.cjs`; `node scripts/premium/read-together-server-smoke.cjs`; `git diff --check`.

Negative evidence covers all non-reading capabilities, old tutor token reuse, general/tutor endpoint calls, exact tool lists, dedicated discovery default-off/query rejection, broadened OAuth scopes, signed broad bearer, non-owner interaction/completion before repository writes, consent scope escalation/missing acknowledgment/another owner, and another session ID. The browser still exercises real OPFS Reading Room + owner HTTP + separate SDK MCP client at 380/768/1280, RTL and keyboard. Test auth is explicitly disposable, not proof of a dot connection.

Final local results: PASS aggregate 2331/2331 (`.tmp-scope-unit.log`); PASS focused 9/9 (`.tmp-scope-tests.log`); PASS MCP 101 checks/38 tools/two protocol versions (`.tmp-scope-mcp.log`); PASS OAuth deployment/B0/consent bridge (`.tmp-scope-oauth.log`); PASS production handlers 61 checks (`.tmp-scope-handlers.log`); PASS Chromium (`.tmp-scope-browser.log`), full server/migrations/default-off/integrity (`.tmp-scope-server.log`) and `git diff --check`. Logs/screenshots remain ignored local evidence, not release files. Three iPhone Python sources were normalized to the committed LF attributes in the fresh worktree; no archive or assertion changed. The research builder's unrelated regenerated manifest is excluded from release.

Before main push (which triggers Coolify): verify fresh production DB backup, disk/headroom, current deployed SHA and release/version availability; fetch main again and require no conflicting update. Migration is schema-changing, so backup proof matters. Preserve other worktrees. After push verify exact built/deployed SHA, CI and live shell version/integrity, migration readiness, unauthenticated owner-route denial, and default-off MCP or proper bearer challenge under the deliberate owner window.

Rollback: close the reading connection/access window first, remove or suspend only the new public client, then revert release code through main and deploy with a new shell/cache version. Leave migration 077's additive scopes in place; do not delete existing grants or downgrade the database blindly. A restore from the validated pre-release backup is a separate owner-approved recovery operation. Process restart invalidates in-memory reading sessions.

Production preflight on 2026-10-02 used the explicitly authorized SSH route with existing host-key verification. Deployed SHA is f13d4aabc74141ae3702bdf9518e7bfa6ad22e11 (Coolify finished record and running image agree). The owner authorized unused-image cleanup; exactly the unused previous-release image was removed, while the running image was retained for rollback. Free space increased from 1.61 GiB to 5.02 GiB. Existing owner binding and OAuth key presence were checked without printing key values; no new signing/cookie/audit keys are needed. Existing enabled flags were observed, not changed.

A fresh predeployment backup completed successfully using the unchanged SQLite Online Backup script with a new isolated destination and a lock on the ordinary backup directory. The new destination contains no old retention targets; all existing daily/full/milestone backups remain untouched. Snapshot: 896290816 bytes; archive: 673865183 bytes; SQLite integrity check passed, gzip/archive layout validation passed, and the extracted database checksum matched the online snapshot. The daily policy excludes existing nested backups and audio cache and records those exclusions in the manifest. No private database or credentials were downloaded or committed.

The confirmed public client profile remains separate from consent. Publication, discovery and exact runtime/registration matching must be verified before the owner finishes creating the plugin; automated local/browser evidence is not evidence of an actual dot OAuth grant or live conversation.

## Published verification, 2026-10-02

Main was advanced normally to `d0dc571c81f1f7017a65325bb0ad5fbbdfba1376`; Coolify deployment `yxo06gm43f0fxapazspa5qpm` finished. The running container started at 00:29:06 UTC with that exact image tag, image digest `sha256:614887af92cfaab1701f72b63f689b0f4930f9221980b3131b36f145390bc550`. Live version is 3.11.716. DB/migration health is ready, migration 077 is recorded and the grant schema includes the two new scopes. All 139 published shell-integrity hashes matched the served files.

The confirmed public profile was configured through Coolify's environment-variable model. The active PUBLIC client row, runtime profile and exact callback match. There is one configured owner and that account exists. The deployed client policy permits only the two Read Together scopes. Existing enabled flags and secret keys were retained unchanged. Discovery advertises exactly those scopes; OAuth advertises token auth `none` and PKCE `S256`. An unauthenticated MCP POST returns 401 with the dedicated resource metadata and two-scope challenge. The reading owner HTTP route returns 401 without a user session. A request adding `profile.read` is rejected with 400 `invalid_scope` before setting a cookie.

No dot connection, consent grant or token was created by verification; the new client's connection count was zero. The owner can now finish creating the custom plugin and complete interactive consent themselves. Actual context retrieval in this conversation remains NOT RUN until that connection exists and the owner explicitly starts a reading session. Production negative signed/non-owner token tests were not fabricated; those boundaries are covered by the local disposable-client tests and verified production owner configuration.

[GitHub CI run](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/36945950688): PASS unit/contracts, API/migrations, ingest, authenticated learner isolation and FSRS; FAIL Memory Canon 89/90, exactly `MIGRATIONS.length 54 != 53` (last fixture `053_mediatheque_personal`). The same failure is present in the preceding production-base run 36911758992; it was not masked or changed. Coolify deployment and live checks passed independently.

After build, available disk is 1470080 KiB (1.40 GiB; df 97%, public health sample 96%). The prior production image is retained for rollback. Docker reports unused build-cache reclaimable space of 1.203 GB; cleanup of that cache, containers, volumes or backups was not performed. Another deployment/backup requires a fresh headroom check and any separately authorized cleanup. These publication notes are committed only to the release branch, avoiding another production deployment for documentation.
