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

## M2 / 3.11.692

Подготовлен source-recall цикл, flag остаётся default-off. Проверки/границы:
[M2 evidence](M2_IMPLEMENTATION.md). Результат deployment дописывается после
проверки реально опубликованной версии; локальный PASS не является production PASS.
