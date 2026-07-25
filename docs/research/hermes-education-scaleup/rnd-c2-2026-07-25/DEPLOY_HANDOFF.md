# C2 WebUI extension deployment record

This is an operator handoff, not an owner benchmark procedure. No C2 audio has been sent.

## Completed deployment

- Owner ran `deploy-c2-webui.ps1`; receipt status is `PASS` at
  `2026-07-25T07:07:13.7766684+03:00`.
- Running image: `linguistpro/hermes-webui-c2:20260725-1`; retained rollback image:
  `linguistpro/hermes-webui-c1:20260724-1`.
- Post-restart checks: WebUI health 200, extension enabled, sidecar proxy explicitly consented,
  sidecar health 200 and `configured: true`.
- Exact 380 x 844 responsive evidence is retained at `evidence/c2-webui-380x844.png`.
- No token, microphone, audio or RT1–RT3 observation was consumed by deployment verification.

## Read first

1. `CLAUDE.md`
2. `docs/PROJECT_ROLES.md`
3. `PREREGISTRATION.md` including Amendment A
4. `ADVERSARIAL_DESIGN_REVIEW.md`
5. this file

## Bounded redeployment procedure

1. Record `git status`, current `hermes-webui` image/id, `/health`, extension status and the exact
   compose diff. Preserve all unrelated worktree changes.
2. Build from the `prototype/` directory context with
   `webui-extension/Dockerfile`. The base must remain
   `linguistpro/hermes-webui-c1:20260724-1`; tag the candidate
   `linguistpro/hermes-webui-c2:20260725-1`.
3. The compose mutation is limited to the `hermes-webui.image` value. Do not change volumes,
   ports, password, working containers or stored data. The shared `hermex-hermes-home` volume
   exposes the owner-controlled Gemini credential to the startup broker; it reads only the
   allowlisted key names and drops privileges before listening. Never copy the key into the image,
   compose file, logs or browser.
4. Recreate only `hermes-webui`. Verify `/health`, ordinary chat, C1 audio attachment flow and
   `GET /api/extensions/status` before granting sidecar proxy consent in the UI.
5. Verify the extension at desktop `http://localhost:8787`, then the existing Tailscale HTTPS
   origin on iPhone. Do not use plain tailnet HTTP for a microphone test.
6. Capture the required screenshot at 380 px. Test keyboard focus, reduced motion, microphone
   denial, missing key, proxy consent missing, `429` copy and H2.6 fallback. A connection-only
   token/handshake may not send audio and must not consume RT1–RT3.
7. Only after these gates update `REPORT.md`/`STATUS.md`, then create a scoped commit containing
   only the C2 paths and the C2 status line and push `main`.

Rollback: change only `hermes-webui.image` back to
`linguistpro/hermes-webui-c1:20260724-1` and recreate that container. Volumes and sessions remain
untouched.
