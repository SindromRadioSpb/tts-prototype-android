# Product Pulse 3.11.606 — release evidence

Проверено 2026-09-22, 09:02–09:05 UTC. Это post-push дополнение к implementation packet.

- Commit `e88f121772f59c277abc5f9ff3647ac5febaae5e` опубликован в main; на момент проверки `HEAD...origin/main = 0/0`.
- Active image имел tag точного release commit; `/api/client-config` вернул 3.11.606.
- Все 112 served integrity assets совпали с опубликованными SHA-256 и Git blobs; SW, pulse.js и pulse.css совпали с commit bytes.
- Три no-cache `/healthz`: ok=true, DB/migrations ready=true, disk_warn=false, disk_pct_used=75.
- После сборки явно разрешённый `docker builder prune -af` удалил только 2.302 GB неиспользуемого build cache. Образы, контейнеры, volumes, БД и backups сохранены; build cache воспроизводим.
- Owner-live `/pulse.html` показал contract 1.1/schema 2, 7 events/5 properties, доступный Umami, честные v2-ноли и недоступные ratios при нулевых знаменателях. Учебные данные владельца не открывались и не изменялись.
- Automated: unit 1869/1869, i18n 233/233, API/ingest, learner-ingest 24/24, FSRS 140/140, memory-canon 90/90; Product Pulse auth/contract/fake-Umami/UI 380/768/1440/zero/partial/outage PASS.
- Physical-device и assistive-technology acceptance не заявлялись; платная операция и действие реального learner для наполнения счётчиков не создавались.
