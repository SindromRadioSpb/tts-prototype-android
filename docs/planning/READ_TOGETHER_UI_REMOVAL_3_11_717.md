# Read Together UI removal — 3.11.717

Owner approved removal of the production UI and restoration of the reader layout while retaining the server connection. Overlay and a new embedded chat are explicitly out of scope.

## Change

- Remove the Read Together script from both Studio and Room shells and from SW precache/integrity. Remove its Room mount/stop/detach hooks. The legacy module file is retained but not loaded or mounted.
- Reader/video/table use the existing layout without Read Together float/clear/width rules. No new layout or chat runtime is introduced.
- Shell/SW version is 3.11.717; Room module URL is v=717 everywhere, including server shell integrity. Package version is not the release source of truth.
- Server session routes, MCP tools/discovery, OAuth policy/profile/scopes, migrations, credentials and database code are unchanged. No grants/connections/notes are deleted. Normal deployment restart expires the process-local active sessions; existing authorization remains.

## Evidence

Local commands from the isolated `fix/read-together-layout` worktree:

```
npm test
node --test tests/readTogether*.test.js tests/approvedClients.test.js tests/shellIntegrityPrecacheParity.test.js tests/shellModuleWiring.test.js tests/swUpdateFlow.test.js
node scripts/premium/read-together-server-smoke.cjs
node scripts/premium/read-together-browser-smoke.cjs
npm run smoke:agent-access:oauth-deployment
npm run smoke:agent-access:mcp
npm run test:api-smoke
npm run smoke:ingest
npm run smoke:learner-ingest
npm run smoke:fsrs
npm run smoke:memory-canon
git diff --check
```

PASS: unit 2331/2331; focused 35/35; full server DB/migrations/default-off/integrity; OAuth deployment/B0/consent bridge; MCP 101 checks/38 tools/two protocols; API smoke; ingest; learner isolation 24/24; FSRS 140/140. Learner smoke initially required a worktree-local node_modules path; an ignored junction to the existing project installation resolved that harness prerequisite.

The replacement browser smoke uses actual 3.11.716 shell/SW bytes from d0dc571c, the current real disposable server and one persistent Chromium profile. Synthetic OPFS text and recorded local WebM reproduce the old block; user Update loads 3.11.717 and retains the material/video/local note. It checks 18 combinations (RU/HE/EN × light/dark × 380/768/1280), video decoding, plain-text switching, keyboard return, no page overflow, no Read Together DOM/module/API calls, and old-version cache eviction. Screenshots and geometry are ignored evidence under `.tmp/read-together-ui-removal/`; representative mobile dark and desktop RTL screenshots were visually inspected. This is automated local evidence, not owner production acceptance or a new dot connection.

KNOWN FAIL: Memory Canon 89/90, literal `MIGRATIONS.length 54 != 53`. It reproduces the pre-existing main failure; draft PR #9's repair is not included. A missing optional `/vendor/hash-wasm/sha256.umd.min.js` is also reported by both old/new local SW precache; it does not prevent activation, consistent with the existing optional-asset handling.

## Verified production publication — 2026-10-02

Source/main commit: `0bb7bead6456eede8641298a6bb9def7221c427d`. Normal Coolify deployment `t9mlgmnhoi6ait4dtgnq1741` finished; running container `e2d948a3bd91` started at 02:36:56 UTC with image `sha256:0422230b54cf7890746d03f1ba798c62c157cb1b579dc7fe934a1ee0becbf18b` (Linux/amd64, exact source revision label). This evidence-only follow-up is not another main publication.

Following explicit owner authorization, seven precisely selected unused private build-cache records reclaimed 1,203,391,680 bytes. All existing container references and both protected current/rollback images remained unchanged. No images, containers, volumes, backups, logs or user files were deleted.

A clean tracked-source archive was built locally, checked with native SQLite and a disposable full server, and streamed directly into the production Docker image store. Shared base layers and clone budget were measured first. Installed Coolify's verified existing-image path performed its normal deployment with `Build step skipped`; no registry, app flags, OAuth credentials/grants, permission settings or runtime environment were changed. Main was fast-forwarded only after the exact image was present. The previous build blocker was resolved by this measured path, not by assuming a full server build was safe.

Live browser evidence: six layouts at 380/768/1280 in RU/light and HE/dark/RTL passed; video/table widths are restored and no Read Together module, panel, float rules or blank gap remains. Screenshots and geometry are under ignored `.tmp/ui717-live/`; representative mobile Hebrew and desktop Russian screenshots were visually inspected. Production assets were loaded, but material/video were synthetic local OPFS fixtures in an isolated browser profile; all POST/PUT/PATCH/DELETE requests were blocked. This is not physical-device or owner-profile acceptance.

Live public version is 3.11.717; all 138 public shell-integrity hashes match. `/healthz` returns ok with database and migrations ready. OAuth discovery retains exactly `read_together.context.read` and `read_together.action.propose`, issuer `/oauth`, PKCE S256 and public-client authentication `none`. Unauthenticated MCP returns 401 with the exact resource metadata/scope challenge when sent its supported Accept header. Existing connections remain authorized, but the removed UI no longer starts new reading sessions.

Main CI run [36956384211](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/36956384211) failed only at Memory canon replay and persistence, the known 54-versus-53 baseline. Draft PR #9 was not merged into this UI fix.

Final disk is 1,452,268 KiB available (1.385 GiB), 97% used. This is still insufficient headroom for an unmeasured future full build; O-055 remains open for capacity maintenance. No additional cleanup is authorized by this rollout.

Open https://linguistpro.kolosei.com/library.html and accept the normal Update action if an existing installed profile still shows 716. Do not clear site/OPFS data. Rollback should revert only this UI change with a new shell/cache version; do not roll back schema, OAuth policy/grants or restore the database for a UI-only change.
