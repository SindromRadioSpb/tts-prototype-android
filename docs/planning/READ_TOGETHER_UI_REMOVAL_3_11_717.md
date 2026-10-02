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

## Publication gate

Last read-only production measurement: 38G filesystem, 35G used, 1.5G available, 97%. Non-privileged `docker system df` was denied access to the Docker socket. No permission, setting or storage cleanup was changed.

The prior verified build consumed about 3.00 GiB (4.40 GiB before → 1.40 GiB after). This checkout's approximate tracked COPY source is 575,962,348 bytes before clone/build-context/image overhead. Cached reuse may reduce the next build, but it is not verified. Do not trigger a main push/build at the current headroom. A conservative gate is at least 4 GiB free, or a separately approved read-only Docker build/layer inspection demonstrating a smaller safe budget. Reclaiming approximately 2.5 GiB or increasing host capacity is a separate owner decision; no broad prune, image/container/volume/backup/cache deletion is authorized here.

Until that gate clears, production remains d0dc571c / 3.11.716 and still has the old UI. After publication verify Coolify's exact commit and running-image SHA, live 3.11.717, all shell-integrity hashes, absent script and Read Together block, reader layout in a real browser, unchanged two-scope discovery and unauthenticated 401 MCP challenge. Existing installed profiles must accept the normal Update action; do not clear their OPFS/site data.

Rollback should revert only this UI change with a new shell/cache version. Do not roll back server schema, OAuth profile or grants and do not restore the database for a UI-only change.
