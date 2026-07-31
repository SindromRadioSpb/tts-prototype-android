# Owner packet — Windows Local ASR beta push/deploy/distribution

Current decision: `GO UNSIGNED — OWNER + TRUSTED USERS, OUT-OF-BAND ONLY`. Local engineering is
complete. Public hosting, push/deploy, production flag mutation, and permanent integration remain
unauthorized.

## Owner decision — 2026-07-31

> «1. Выпускаем установщик без подписи. им будут пользоваться сейчас только я и мои доверенные
> пользователи. 2. программа некоммерческая. вопрос лицензирования снят. 3. human-gold проверку
> проведу по факту на проде. 4. готов Проверить работу с настоящего production-origin»

Recorded effect:

- the exact unsigned artifact may be shared manually with the owner and personally trusted users;
- the owner accepts the noncommercial redistribution/license decision for this cohort while the
  bundled third-party notices remain intact;
- human-gold is a post-deploy beta validation task, not a pre-deploy blocker and not a completed gate;
- the real production-origin Chrome/Edge ceremony is authorized without server mutation;
- no public installer hosting, push, deploy, production flag, or general distribution authority is
  inferred from this decision.

## Evidence available

- scoped local implementation commit:
  `1d0fc36dfb357ea3b4b89c9abd53253d7bf0f448`;
- internal unsigned installer SHA-256:
  `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`;
- exact model/revision/hash unchanged;
- Windows 11 + RTX 3070 frozen install/update/restart/real-decode/uninstall PASS;
- system Chrome/Edge local-origin 380×844 LTR/RTL PASS; zero Gemini requests;
- permanent integration remains `NO-GO`.

## Gates before push/deploy or hosted distribution

1. Give a separate exact allowlist for push, deployment, installer hosting, invite cohort, rollback,
   telemetry retention, and production-origin Chrome/Edge verification.
2. Keep human-gold results labeled post-deploy beta evidence; do not claim population-quality PASS
   until the owner records a threshold and result.
3. Keep the permanent 60-minute/12-speaker paired-Gemini gate unchanged.

## Paste-ready next-session instruction

```text
Continue Windows Local ASR invite-only beta distribution from the scoped local enablement commit.
Read first: AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md,
docs/planning/STUDIO_INGEST_LOCAL_ASR_WINDOWS_BETA_ENABLEMENT_PACKET_2026_07_31.md, and
docs/research/studio-local-processing/2026-07-31/windows-beta/{README.md,evidence-report.json,OWNER_PUSH_DEPLOY_BETA_DISTRIBUTION_PACKET.md}.
Preflight HEAD/origin/dirty state and preserve unrelated changes. Do not alter model/revision,
decode/VAD/timestamp policy, provider defaults, schema, or production data. Do not use Gemini.
Before any external distribution, stop unless a code-signing certificate, redistribution-license
approval, completed owner beta acceptance, exact installer hosting allowlist, cohort/rollback plan,
and explicit push/deploy/distribution authorization are all present. If authorized, rebuild from
clean source, sign, verify Authenticode and hashes, push only the scoped commit, deploy default-off,
wait for the actually served version/service worker, verify system Chrome and Edge on the real
production origin, then distribute only to the approved invite cohort. Firefox remains unsupported.
```
