# Hermes owner runtime — M0, 2026-09-29

Owner-specific upgrade tooling, not the mass-user installer (M3).
Baseline: `5e4a924a`; execution branch `feat/mentor-byoa-m0`.

## Reproducible WebUI overlay

Run `./ops/hermes/build-webui.ps1` from PowerShell with Docker available.
The build context contains an explicit allowlist of source files, never owner
configuration, OAuth credentials, session files or `.env`.

- Agent: `nousresearch/hermes-agent@sha256:fca358f12efd65bfaaca05884166f15c0e2788375ca30d77061ac1ebc96452b7`
  (`v0.21.5`, release `2026.9.24`, commit `f97608f1`).
- WebUI base: `ghcr.io/nesquena/hermes-webui@sha256:48ba6ee4a837079955c00e997b751065cc0324ae6eaa0f2fec592c8f4b2a746e`
  (`0.52.113`).
- Local overlay: `linguistpro/hermes-webui-c2:20260929-3`.

The overlay preserves the historical C2 extension and C1 current-turn audio
attachment bridge. A source hash and exact replacement checks stop unexpected
upstream changes. Four build-time tests exercise the actual shipped message
builder: audio in both image modes, current-turn isolation, rejected paths,
and mixed attachments. These are not microphone or paid voice acceptance.

WebUI installs Agent dependencies from a writable staged copy. Current Hermes
rejects wheel installation. `patch_installer.py` changes this to an editable
installation and retains its source in `/app/hermes-agent-build`, including
across container restarts. Clean installation, Agent import and restart were
verified on an isolated fixture volume before owner cutover.

The overlay also uses SQLite 3.53.4 from the pinned Agent image. The two base
images are Debian 13; build-time Python verifies its actual linked version.
This replaces WebUI's 3.46.1, which triggered Hermes' WAL reset bug warning.

## State and rollback

Live owner compose: `G:/HERMES_AGENT/docker-compose.hermex.yml`.
Private pre-upgrade backup: `G:/HERMES_AGENT/private/mentor-m0-20260929/`.
It contains source/home archives, checksums, previous compose and the private
runtime environment. Never copy that folder into this repository.

Upgrade uses a new source volume and a restored home volume. The old source
volume must not mask the new image's `/opt/hermes`. Stop both owner writers
before refreshing the restored home or changing versions; do not run cloned
credential stores concurrently. Preserve newly authorized Codex `auth.json`
when refreshing the home from the previous instance.

Rollback requires stopping both new writers, restoring `compose-before.yml`
to the live compose path, then running the original compose project
`hermes_agent` with its existing `.hermex.env`. Old images and named volumes
remain retained. Rollback selects the old home: post-upgrade sessions are in
the new home and must be separately preserved/reconciled. Do not delete them.

## Provider and MCP are separate

1. Authenticate with `hermes auth add openai-codex --type oauth --no-browser`.
   User completes the official browser sign-in. Never copy Codex app tokens.
2. Discover the authenticated provider catalog before choosing a model.
3. Run `configure_codex_route.py <model>` as the runtime user, with its
   `HERMES_HOME`. This explicitly routes main and configured auxiliary text
   tasks through Codex OAuth and removes configured model fallback lists.
4. Recover LinguistPro MCP through the existing bounded PKCE helper, then
   verify token owner `1000:1000` and mode `0600` without printing its content.
5. Verify discovery from the gateway user and a real ordinary WebUI turn.

C2 Gemini Live remains a separate voice integration. Text subscription login
does not make voice free or authorize an unrequested paid voice test.

See the execution ledger and M0 evidence under
`docs/research/mentor-byoa/2026-09-29/` for live acceptance status.
