# Owner packet — Windows Local ASR beta push/deploy/distribution

Current decision: `NO-GO EXTERNAL DISTRIBUTION`. Local engineering is complete; nothing has been
pushed, deployed, hosted, or distributed.

## Evidence available

- scoped local commit: fill after commit;
- internal unsigned installer SHA-256:
  `1079fc4e09c038c1704f503228285a097347dfc25ae267f3e287289feca0acbe`;
- exact model/revision/hash unchanged;
- Windows 11 + RTX 3070 frozen install/update/restart/real-decode/uninstall PASS;
- system Chrome/Edge local-origin 380×844 LTR/RTL PASS; zero Gemini requests;
- permanent integration remains `NO-GO`.

## Gates before an external invite

1. Provide a code-signing certificate and rebuild/sign/verify both executable layers.
2. Approve NVIDIA and FFmpeg redistribution-license review and the 1.77 GB Companion size.
3. Freeze the 12–15 minute, four-speaker independent human-gold beta set.
4. Complete the blinded worksheet and record the owner beta threshold.
5. Give a separate exact allowlist for push, deployment, installer hosting, invite cohort, rollback,
   telemetry retention, and production-origin Chrome/Edge verification.

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
