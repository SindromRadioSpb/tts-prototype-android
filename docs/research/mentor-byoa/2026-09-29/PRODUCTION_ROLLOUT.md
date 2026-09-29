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
