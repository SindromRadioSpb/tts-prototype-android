# Медиатека: проверка исправления хранилища

Дата: 2026-09-12. Исходный runtime: `0321d092`, 3.11.523. Опубликован runtime 3.11.524, commit `962cb80046ebb7056ec2bcbbdec99e4cbc0d332d` (main и работающий production-контейнер). Статус: PRODUCTION VERIFIED. После разрешённой владельцем очистки только unused Docker build cache и штатного перезапуска зависшей сборки Coolify завершил deployment `p9r0qdqc1qyxfxcjtv7c15xy` в 09:46:38 UTC. После выкладки свободно 4,2 ГБ (89% занято). См. `deployment-inventory.json`.
Это вручную поддерживаемый отчёт. Редактировать README и `docs/planning/ROOM_MEDIATHEQUE_IPHONE_STORAGE_FIX_2026_09_12.md`; JSON/PNG генерируются скриптами. `.tmp/` содержит временные логи и изолированные серверные БД. Личные материалы владельца не включаются.

## Команды

- `node scripts/premium/mediatheque-storage-smoke.cjs` → `local/evidence.json`, снимки RU/EN/HE 380px. Настоящие OPFS/IndexedDB в disposable Chromium-профиле: удержание sync handles исходным worker, постоянный отказ, освобождение, кнопка Retry, отдельные библиотеки с разным содержимым, побайтовое сравнение материалов и непустого review_log, освобождение при переходах, автоматическое восстановление кратковременной блокировки. До фикса тот же сценарий завершился timeout после Retry; после фикса 9/9 PASS (добавлен запрет remote publication/provider writes).
- `node --test tests/vfsBootRecovery.test.js tests/vfsOrder.test.js tests/localDbInitConcurrency.test.js` → 12/12 PASS. Исполняется реальная orchestration boot/retry из worker с контролируемыми отказами VFS: оба backend, исчерпание попыток, отсутствие записей в другой store, первый запуск и неизвестная identity.
- `$env:MEDIATHEQUE_EVIDENCE_DIR='docs/research/mediatheque-iphone-storage/2026-09-12/local-regression'; node scripts/premium/mediatheque-browser-smoke.cjs` → полный существующий сценарий Медиатеки, 63/63 PASS, 5000 материалов, две вкладки, reader/back, публикация только в локальной тестовой БД, offline cold boot и update service worker.
- `npm test`; `npm run test:api-smoke`; `npm run smoke:room-media`; `npm run smoke:reader-parity`; `node tests/i18n.smoke.js --write-lock` — общие гейты. Итог: npm test 1574/1574 PASS; API smoke PASS; room-media PASS; reader parity 37 leaf + 4 builder/golden PASS; i18n 233/233 PASS (locale v219). Для существующего byte-parity теста iPhone-хелпера пять неизменённых исходников временно приведены к LF-байтам HEAD и побайтно восстановлены после прогона. Генерируемые полным тестом Physics-артефакты восстановлены в чистом отдельном checkout.
- `$env:MEDIATHEQUE_EVIDENCE_DIR='docs/research/mediatheque-iphone-storage/2026-09-12/production'; node scripts/premium/mediatheque-live-smoke.cjs` — только читающие production HTTP-запросы и отдельный локальный browser-профиль. Проверяются версия 3.11.524, integrity worker/VFS и UI, завершённые reload, public reader/back и публичные снимки.

## Границы

Исходный физический iPhone-баг подтверждён владельцем. После исправления физическая приёмка ожидает повторного открытия на том же устройстве. Контролируемое воспроизведение не устанавливает конкретную низкоуровневую ошибку того iPhone.
Ни очищение браузерных данных, ни смена VFS preference, ни перенос пользовательской библиотеки для восстановления не требуются и владельцу не предлагались. Изменение preference используется только внутри явно одноразового тестового профиля для проверки двух разных хранилищ.

Для того же storage-сценария на production-файлах: установить `$env:MEDIATHEQUE_STORAGE_BASE="https://linguistpro.kolosei.com"` и `$env:MEDIATHEQUE_EVIDENCE_DIR="docs/research/mediatheque-iphone-storage/2026-09-12/production-storage"`, затем `node scripts/premium/mediatheque-storage-smoke.cjs`. Этот режим не запускает сервер и использует только одноразовый browser-профиль. После завершения выкладки выполнен: 9/9 PASS, включая реальную конкуренцию за OPFS, Retry, автоматическое восстановление, оба разных хранилища и неизменность непустого review_log. Ноль remote publication/provider writes.

## Production-результат

- Общий live smoke: 41/41 PASS, 211 публичных материалов, worker/VFS/UI/locale integrity, три завершённые перезагрузки, RU/EN/HE 380px, actual public reader/back и disposable local video reader/back; ноль page errors. Первая ранняя проба поймала смесь old/new файлов при rolling deployment и не была принята; после завершения deployment полный проход успешен.
- Kapture: UI module v4, Room 3.11.524, личный каталог и переход Медиатека → Room → Медиатека; восстановились сохранённые условия видео/список. Консоль без ошибок. Профиль владельца не использовался для искусственного повреждения или тестовых записей.
- Read-only owner review_log до/после: 7758 записей, одинаковый SHA-256 `688839bce8b13302f4f10f236de020d2d6a3ab35c7f66c969f44632af5cf76ad`. Исходная рабочая вкладка Studio оставалась на своём уже открытом документе 3.11.523; её принудительно не перезагружали. Свежие production-профили отдельно проверили worker 3.11.524.
- Физический повтор на iPhone после исправления остаётся OWNER RETEST PENDING.
