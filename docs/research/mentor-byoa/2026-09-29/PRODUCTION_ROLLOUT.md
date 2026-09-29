# Mentor BYOA — staged production rollout

Дата: 2026-09-29. Владелец разрешил постепенную production-поставку и продолжение.

## M1 / 3.11.691 — VERIFIED

- `origin/main` перед релизом: `390486d3`, M1 был на 4 commit впереди, расхождений нет.
- Перед миграцией сделан отдельный consistent online SQLite snapshot, 890089472
  bytes, `PRAGMA quick_check=ok`; приватно на сервере, без содержимого в git.
- Fast-forward `main` → `374e26c13b0f660dd2dce17f987eb83a41c0701f` запускает Coolify.
- Active image подтверждён exact commit. Read-only schema probe подтвердил
  `070_tutor_transport` и три tutor-таблицы. DB/migrations ready.
- No-cache `/api/client-config` = 3.11.691; hashes tutor-client, tutor-panel и
  library-ui совпали с published shellIntegrity. `/api/tutor/capabilities`:
  `enabled=false`. Новая возможность не включена для массовой аудитории.
- Во время rolling replacement один ранний config probe ещё показал 3.11.690,
  тогда как capabilities уже обслуживал новый контейнер. После завершения rollout
  повторная проверка подтвердила 3.11.691; ранний mixed sample не засчитан как PASS.

## Диск и сохранность

До релиза: 85%, 5.5G available, существующий disk_warn=true. Сборка и отдельный
backup довели диск до 96–97%. После свежей инвентаризации удалён только BuildKit
cache (reported 2.384GB) и четыре непривязанных старых образа приложения:
`cd767b240cf8`, `dc3aadf1ff08`, `897353174a8c`, `43bd7a90976d`.
Каждый image ID перед удалением проверен против всех container.Image refs.
Текущий `374e26c1` и rollback `390486d3`, все 12 контейнеров, 4 volumes, БД,
backup и owner data сохранены. Никакого docker system prune.
Повторная инвентаризация: build cache 0, 7.3G available, df около 80%; health
по последнему cached sample ещё disk_warn=true (81%). Это не выдаётся за снятый alert.
Один docker system df попал в удаление временного Coolify helper и вернул snapshot
race; повтор после завершения helper подтвердил нормальную инвентаризацию.

## M2 / 3.11.692 — VERIFIED FLAG-OFF

- Main/active image: `d016819d7ee20824fb7071f66bec6a681dfa22ff`.
- Read-only SQL: `071_tutor_practice` применена, `tutor_practice` присутствует.
- Повторные no-cache health/config probes: DB/migrations ready, 3.11.692.
  Tutor client/panel/practice, library-ui и SW сверены не только с manifest,
  но и с байтами опубликованного git commit: [JSON](M2_PRODUCTION_RESULT.json).
- `/api/tutor/capabilities` enabled=false; `/api/tutor/connection` 404.
- [Production browser probe](M2_PRODUCTION_BROWSER.json): свежий гостевой Chromium,
  обе настоящие страницы, модули загружены, pageErrors=[]; `tryOpen` возвращает false,
  новый dialog не появляется. Это automated production guest evidence,
  не owner acceptance и не модельный production roundtrip.
- После окончания сборки отдельной операцией удалён её BuildKit cache (2.385GB
  reported). Старый образ `e8ce6b30d07a` / `390486d3` удалён только после проверки
  отсутствия всех container refs. Теперь сохранены active `d016819d` и rollback
  `374e26c1`; 12 контейнеров, 4 тома и все backups сохранены. Build cache 0.
- Итог: 7.3G available, df 80%, health 81% / disk_warn=true. Предупреждение остаётся;
  резерв для следующей сборки есть, capacity/retention занесены в O-047.

[M2 functional evidence](M2_IMPLEMENTATION.md). Следующий rollout — ограниченное
включение после owner-scoped gate и доступного подключения; текущий флаг глобальный,
его нельзя включать всем как замену ограниченному pilot. M3 должен дать удобный
мастер, а полный M2 — независимые языковые задания. Rollback: образ M1 с flag off;
аддитивную таблицу 071 удалять и откатывать общую БД ради rollback не требуется.

Воспроизводимый read-only verifier:
`node scripts/premium/tutor-release-verify.js --version 3.11.692 --commit d016819d`.

## M3 / 3.11.693 — OWNER PILOT ENABLED

- Final active image: `94d6166f92e3445dd67061f035a3eeaa33cce21c`, image ID
  `201426354aef19186f7132e278d5c0d8af1d55eea3cc527c41a5ad2803916fc0`.
- Pre-migration SQLite snapshot: quick_check=ok, 890089472 bytes, private backup.
  Additive `072_tutor_onboarding` applied and verified read-only.
- Seven-day grant for exactly the configured owner, expires 2026-10-06 15:00 UTC.
  Global rollout remains off; anonymous capability false, protected routes 401.
- [Served bytes/manifest/SW/health](M3_PRODUCTION_RESULT.json) match final git
  commit; [fresh guest browser](M3_PRODUCTION_BROWSER.json) checks Studio/Room
  modules, setup sign-in and denied installer access. No page errors.
- Unsigned pilot installer uploaded to gated data-volume downloads; SHA256
  `5d86104f8e9525ee80b34ecafb168e02b40534a829642d77a90e36376ee0e1e3`.
- Windows helper installed and runtime contract verified; owner confirmed window
  appearance and connection. [Owner browser model roundtrip](M3_OWNER_LIVE.json)
  received a source-specific answer in Room; no independent language grade claimed.

### Deployment recovery and bounded cleanup

Initial M3 commit `4a34ec7e` deployed. Two subsequent attempts failed at Git SSH
authentication, not application startup. The public repository read transport
was changed to its same official HTTPS URL; final deployment succeeded.
After owner authorization, the obsolete deploy key was fingerprint-matched,
checked for other references, detached, revoked at GitHub, and deleted in Coolify.
Its exact encoded value was redacted from 597 retained deployment records. The
separate server connection key was unchanged. No key values/raw logs are in git.

After each completed build, inventory preceded BuildKit cleanup. Exact old images
`374e26c1` then `4a34ec7e` were removed only after checking all container image refs.
Final retention: active `94d6166f`, stable rollback `d016819d`, all 12 containers,
4 volumes, all DB/backups/user data. Build cache 0; 6.5G available, df 83%.
Health disk warning remains; this is not a capacity-policy fix. No system prune.

Rollback: disable owner rollout first, then use the retained M2 image with global
flag off. Do not delete additive tables or restore the entire user DB for rollback.

## M3 follow-up / 3.11.694 — VERIFIED OWNER PILOT

- Automatic deployment of `e877e8ea1ae6bd3e4349897298b15354957b086c` succeeded
  through public HTTPS after obsolete deploy-key revocation.
- Active image ID: `b2dfe8e385ba0ee4361e8c86a27ec5171a5950ea47ba0f23411e40957369a010`.
- [Repeated health and served-byte proof](M3_694_PRODUCTION_RESULT.json):
  DB/migrations ready, guest capability false, protected connection route 401.
- Owner browser applied the PWA update and displayed v3.11.694. Reopening the
  earlier two-word heading restored its explanation without another model request;
  the unavailable practice CTA was absent. Return-to-reading remained available.
- After fresh inventory, only completed-build cache was pruned (2.386GB reported).
  Final inventory: cache 0, 12 containers, 4 volumes, 5.4G available / df 86%.
  Active 694, immediate rollback 693 and stable M2 image remain; DB/backups unchanged.
  Capacity warning remains open (O-047).
- This closes connection and short-heading regression verification, not independent
  Hebrew review, clean-machine installation or broad-public readiness.

## M4 / 3.11.695 — VERIFIED OWNER PILOT

Deployment `554e5482` finished; active image tag verified. Repeated health and
served-byte integrity: [result](M4_PRODUCTION_RESULT.json). Fresh guest browser:
[result](M4_PRODUCTION_BROWSER.json), no page errors; BYOA remains owner-only.
After inventory, completed BuildKit cache pruned (2.388GB); only unreferenced
693 and stable M2 images removed, preserving active 695 and immediate rollback
694, all 12 containers, 4 volumes, DB and backups. Free space 6.5G / 83% used.
Capacity policy remains O-047. Owner hub flicker takes priority before next M4 work.

## Room critical fix / 3.11.696 — VERIFIED

`cbcc79f2` deployment finished. [Root cause and reproduction](ROOM_HUB_REFRESH_FIX.md).
Rolling deployment initially returned 695 then a mixed module response; verification
was repeated after convergence and all served hashes passed. Active image
`8cf852ca194f9a98c027f7382e153425fc98ee2d5e68380aeaab4d1aef19dfa8`.
Fresh guest browser regression PASS, owner open tab updated and home stable.
After inventory: completed build cache 2.388GB pruned; exact unreferenced 694 image
removed; active 696 and rollback 695 retained. 12 containers, 4 volumes, DB and
backups preserved; cache 0, 6.5G available, df 83%. Health DB/migrations ready;
disk warning remains O-047. No broad prune or cache/storage reset in owner browser.

## M4 continuation / 3.11.697 — VERIFIED OWNER PILOT

`484fd6e7` implemented the accepted-explanation ZIP/JSON lifecycle and persisted
practice proposal states; `9fcd2705` completed server account export/delete for
session-bound `tutor_practice` and stripped tutor credential/receipt hashes from
account export. Both commits reached `main`; Coolify deployment of `9fcd2705`
finished successfully at 2026-09-29 16:52:53 UTC. Active container
`612282a4465e` runs tag `9fcd270558a989161b1cf89c5c5b0e6c2cb07628`
(image ID prefix `d133aa9ee3e4`). Immediate rollback image `cbcc79f2` remains.

Before migration 073, a private online backup completed: archive
`app-data-20260929-164248.tar.gz` (669575698 bytes), SQLite snapshot 890089472
bytes, archive SHA256 `61ea442136009e25526a6920d79f187348cb36029059d3c533aeb995d3d9302a`.
The archive was confirmed present after deployment; no backup retention deletion
was requested. Read-only SQL confirmed `tutor_practice.proposal_state` in the
active database. The full-schema two-account lifecycle smoke passed locally;
production owner data was not exported or changed for this check.

[Release verifier](M4_697_PRODUCTION_RESULT.json) passed two no-cache health/config
probes (DB and migrations ready), 13 served asset/SW hashes against release bytes,
guest capability off and protected connection 401. [Fresh guest browser](M4_697_PRODUCTION_BROWSER.json)
loaded Studio/Room modules and Mediatheque/tutor sign-in with no page errors;
guest download remained 401. The release verifier passed again after cleanup.
These are automated/read-only production results, not owner acceptance of the new
archive controls or a model roundtrip on 697. The [one real YouTube video probe](M4_OWNER_VIDEO_LIVE.md)
was performed on the preceding owner pilot.

After an inventory showed completed BuildKit cache at 2.388 GB and disk at 92%,
only `docker builder prune -af` was run. Final inventory: cache 0, 12/12 active
containers, 4/4 active volumes, 13 images of which 11 are in use, 4.7 GB free,
87% disk used. Active and immediate rollback images, DB, backups and owner browser
storage were retained. Health's disk warning and capacity policy remain O-047.
Global rollout and new tutor MCP tools/scopes remain closed.

## Video question fix / 3.11.699 — VERIFIED OWNER PILOT

The owner saw the local archive controls in the live browser, then a question on
an exact-caption video failed with `invalid_context` on 697. The client had sent
a bounded `caption` context, but the transport accepted only `local_snapshot`.
Commit `1e71583f` accepts timed caption snapshots through the existing context
validator and removes the per-question checkbox. Asking still explicitly sends
the displayed passage, neighbouring sentences and question to the personal agent.
The 698 account-data route candidate ships in the same 699 release.

[Repeated health and served-byte proof](M4_699_PRODUCTION_RESULT.json) passed
against `1e71583f`: DB and migrations ready, 13 assets/SW matching commit bytes,
guest capability off and protected route 401. [Fresh guest browser](M4_699_PRODUCTION_BROWSER.json)
loaded Studio, Room, Mediatheque and connector pages without page errors. Local
browser fixtures passed a timed video question end-to-end, archive lifecycle,
practice and all tutor surfaces without a consent checkbox. This is automated
evidence; no owner model request was made after the release.

Active image is `73d76e71ed16` tagged `1e71583f`; immediate rollback `9fcd2705`
remains. After build completion and image inventory, only 2.389 GB of reclaimable
BuildKit cache and two exact unreferenced older images (696/695) were removed.
Final inventory: 12 active containers, 4 active volumes, 0 build cache, 5.8 GB
free / 84% used. DB, backups and owner browser storage were not changed.
Global rollout and additional MCP tools/scopes remain closed.

## Conversation and automatic local history / 3.11.700 — VERIFIED OWNER PILOT

Commit `2fa4a160` is served by active image `39b9edf69a31`. Before deployment,
a full production archive and online SQLite snapshot were created and checked;
no backup retention deletion ran. The additive `074_tutor_conversation.sql`
migration is present in the active database (`previous_session_id` and
`local_history_json` columns), and health reports DB and migrations ready.

[Release verification](M5_700_PRODUCTION_RESULT.json) passed twice against
3.11.700 and the commit: 13 served assets/SW match release bytes, pilot access
remains closed to guests, and the protected route returns 401. The
[fresh guest browser](M5_700_PRODUCTION_BROWSER.json) loaded Room, Studio,
Mediatheque and connection pages without JavaScript errors. Local browser tests
covered an actual follow-up in one panel, automatic history after reload and
all four tutor surfaces. No owner model request was made after this release;
owner-live follow-up acceptance remains open.

After the build completed, the inactive 2.39 GB BuildKit cache was removed.
Inventory then confirmed image `d133aa9e` (3.11.697) had no container references;
only this exact obsolete image was removed. Final disk: 4.5 GB free, 88% used;
12 active containers, 4 active volumes, 0 build cache. Active 3.11.700 image,
immediate 3.11.699 rollback image `73d76e71ed16`, DB, volumes, backups and
owner browser data are retained. Health disk percentage may lag the fresh `df`
reading. Global rollout and new tutor MCP tools/scopes remain closed.

## Tutor MCP discovery / 3.11.701 — DEPLOYED, AUTHORIZATION NOT ACCEPTED

Commit `18729d3c` reached `main` and the active image `ca7fbdeffe04`.
Before migration 075, an online SQLite snapshot was created at
`/opt/backups/linguistpro/app-db-before-075-20260929-2134.db.gz`:
890089472 uncompressed bytes, `quick_check=ok`, gzip integrity passed.
The existing full data archive remains untouched. Production health reported
DB/migrations ready; `075_tutor_agent_access.sql` and the handoff table are
present. Seven critical served assets matched checkout SHA-256. Hermes
discovered 35 tools, while its older profile still selected only its 31 tools.

Owner authorization was deliberately stopped: Hermes 0.21.5 requested the
entire protected-resource scope catalog despite the tutor profile's configured
four-scope `oauth.scope`. No owner consent or tutor MCP read occurred. The
next release adds a dedicated narrow discovery/challenge route and updates
only the tutor alias. After the build, exact unreferenced image `73d76e71ed16`
(3.11.699) and 2.396 GB of inactive BuildKit cache were removed; active 701
and immediate rollback 700 were kept. This is a pilot correction, not a
global rollout or owner-chat acceptance.

## Tutor MCP four-scope owner connection / 3.11.702

Commit `58a2c935` reached production as 3.11.702. The tutor-only protected
resource metadata reports the four tutor scopes, and the unauthenticated MCP
challenge requests precisely those four. Hermes 0.21.5's actual authorization
URL also requested precisely the same four. The owner consent completed;
`hermes mcp test linguistpro_tutor` discovered only the four new tools, and a
real read-only `get_tutor_capabilities` call returned one successful content
block. The old `linguistpro` profile still selects 31 tools. No owner model
request or learner-fragment read was made.

The first browser return failed at `127.0.0.1:8765`: Hermes listens on container
loopback, which Docker's published host port did not reach. An operator delivered
the already-authorized, single-use callback within the container; Hermes then
completed. The Windows helper in beta.3 would hit the same problem. Candidate
beta.4 uses a separate host-local callback on port 8766, verifies state and
exact scope/redirect URI, then forwards only that callback to container loopback.
This helper fix requires its own deployed and owner-live validation. The owner
chat roundtrip and global access remain open gates.

After 702 completed, 2.396 GB of BuildKit cache was removed. Image
`39b9edf69a31` (3.11.700) had no container references and was then removed
by exact ID; active 702 and immediate rollback 701 were kept. Fresh `df` showed
4.3 GB free / 89% used before the next build. No database, volume or backup
was changed by cleanup.

## Windows callback repair / 3.11.703 — deployed, 8766 blocked before consent

Commit `d16144e1` reached 3.11.703 with beta.4; eight served assets matched
checkout SHA-256, DB/migrations health was ready, and authenticated pilot
downloaded beta.4 with the manifest SHA-256. Guests received 401. The
first real OAuth request to 8766 reached the provider, but staging the consent
raised `AA_OAUTH_CLIENT_BINDING_INVALID`: the persistent owner client record
still allowed only 8765. The app restarted and returned healthy. The pending
Hermes login was stopped before consent; its tutor token was cleared by
`hermes mcp login`, while the older `linguistpro` profile was untouched.
Migration 076 adds 8766 only to the exact existing owner fixture row. A
read-only production query confirmed its old single-URI value before the
migration; the two-row in-memory migration test passed and left the other
client unchanged. The callback fix is not owner-live accepted yet.

## Persisted callback allowlist / 3.11.704 — verified owner pilot

Commit `b9fb1203` reached 3.11.704. Two no-cache health/config probes reported
the same version with DB and migrations ready; eight served assets/SW matched
checkout SHA-256. A fresh guest browser loaded Room, Studio, Mediatheque and
connector pages without page errors, found no guest tutor capability, and
received 401 for the pilot installer. Coolify displayed the new container
starting; its session expired before an independent post-switch image digest or
fresh disk inventory could be recorded. No broad Docker cleanup followed.

The new OAuth attempt used `http://127.0.0.1:8766/callback` and exactly four
tutor scopes. It reached the concise owner consent screen, then the real
callback functions extracted from installed beta.4 accepted the browser return,
verified its state/scope and relayed it to Hermes inside Docker. The pending
Hermes login completed with four tools. `hermes mcp test linguistpro_tutor`
discovered those four, and a read-only `get_tutor_capabilities` call succeeded
with one content block. After sequential Hermes agent/WebUI restarts, WebUI
returned healthy and the old `linguistpro` profile still showed 31 selected
tools while `linguistpro_tutor` showed four. No owner model inference or
learner-fragment read was performed. The installed beta.4 script matches the
release source hash; the authenticated download on 703 matched its release
manifest SHA-256, and the guest endpoint remained 401 on 704.

This is technical and owner-consent evidence, not an ordinary owner-chat
roundtrip. The Windows button itself has not been exercised as a full GUI
journey, and global rollout remains closed. Account archive
download/restore/delete still lacks owner-live verification on a safe test
record.
