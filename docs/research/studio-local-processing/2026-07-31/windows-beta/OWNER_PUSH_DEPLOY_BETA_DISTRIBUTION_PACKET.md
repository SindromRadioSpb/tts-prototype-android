# Owner packet — Windows Local ASR beta push/deploy/distribution

Current decision: `GO UNSIGNED — OWNER + TRUSTED USERS, OUT-OF-BAND ONLY`; scoped push/deployment
of the default-off `v3.11.274` onboarding is authorized. Public installer hosting, general
distribution, provider-default changes, and permanent integration remain unauthorized.

## Owner decision — 2026-07-31

> «1. Выпускаем установщик без подписи. им будут пользоваться сейчас только я и мои доверенные
> пользователи. 2. программа некоммерческая. вопрос лицензирования снят. 3. human-gold проверку
> проведу по факту на проде. 4. готов Проверить работу с настоящего production-origin»

Recorded effect:

- the exact unsigned artifact may be shared manually with the owner and personally trusted users;
- the owner accepts the noncommercial redistribution/license decision for this cohort while the
  bundled third-party notices remain intact;
- human-gold is recommended evidence, not a pre/post-deploy blocker and not a completed gate;
- the real production-origin Chrome ceremony is complete; Edge is excluded from the first beta;
- no public installer hosting, push, deploy, production flag, or general distribution authority is
  inferred from this decision.

## Evidence available

- scoped local implementation commit:
  `1d0fc36dfb357ea3b4b89c9abd53253d7bf0f448`;
- internal unsigned installer SHA-256:
  `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`;
- exact model/revision/hash unchanged;
- Windows 11 + RTX 3070 frozen install/update/restart/real-decode/uninstall PASS;
- system Chrome local-origin 380×844 LTR/RTL PASS; historical Edge evidence is retained but not advertised;
- permanent integration remains `NO-GO`.

## Gates before push/deploy or hosted distribution

1. The owner authorized scoped push/deployment of the `v3.11.274` onboarding on 2026-07-31. Public
   installer hosting and general distribution remain outside that authority.
2. Deploy the new onboarding if the cohort must use a normal product flow; otherwise explicitly
   accept the existing DevTools-only enrollment for that cohort.
3. Keep the first cohort Chrome-only; do not advertise Edge.

Recommended, non-blocking evidence: ten Mia listen/read checkpoints, a four-speaker human-gold
beta study, and the former 60-minute/12-speaker paired-Gemini study. Do not call them PASS unless
actually performed. Permanent integration remains a separate owner decision.

## Paste-ready next-session instruction

```text
Continue Windows Local ASR invite-only beta distribution from the scoped local enablement commit.
Read first: AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md,
docs/planning/STUDIO_INGEST_LOCAL_ASR_WINDOWS_BETA_ENABLEMENT_PACKET_2026_07_31.md, and
docs/research/studio-local-processing/2026-07-31/windows-beta/{README.md,evidence-report.json,OWNER_PUSH_DEPLOY_BETA_DISTRIBUTION_PACKET.md}.
Preflight HEAD/origin/dirty state and preserve unrelated changes. Do not alter model/revision,
decode/VAD/timestamp policy, provider defaults, schema, or production data. Do not use Gemini.
Manual out-of-band sharing is limited to the owner and personally trusted users and must use the
recorded unsigned artifact hash; do not host it publicly. Push/deploy/hosting still require separate
exact authorization. If deploy is authorized, push only scoped commits, deploy default-off, wait
for the actually served version/service worker and verify system Chrome on the real production origin.
Do not advertise Edge. The optional quality studies are not release blockers
and must not be called PASS unless run. Firefox remains unsupported.
```
