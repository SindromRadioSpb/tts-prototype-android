# Медиатека: проверка исправления хранилища

Дата: 2026-09-12. Исходный runtime: `0321d092`, 3.11.523. Целевой runtime: 3.11.524.
Это вручную поддерживаемый отчёт. Редактировать README и `docs/planning/ROOM_MEDIATHEQUE_IPHONE_STORAGE_FIX_2026_09_12.md`; JSON/PNG генерируются скриптами. `.tmp/` содержит временные логи и изолированные серверные БД. Личные материалы владельца не включаются.

## Команды

- `node scripts/premium/mediatheque-storage-smoke.cjs` → `local/evidence.json`, снимки RU/EN/HE 380px. Настоящие OPFS/IndexedDB в disposable Chromium-профиле: удержание sync handles исходным worker, постоянный отказ, освобождение, кнопка Retry, отдельные библиотеки с разным содержимым, побайтовое сравнение материалов и непустого review_log, освобождение при переходах, автоматическое восстановление кратковременной блокировки. До фикса тот же сценарий завершился timeout после Retry; после фикса 8/8 PASS.
- `node --test tests/vfsBootRecovery.test.js tests/vfsOrder.test.js tests/localDbInitConcurrency.test.js` → 12/12 PASS. Исполняется реальная orchestration boot/retry из worker с контролируемыми отказами VFS: оба backend, исчерпание попыток, отсутствие записей в другой store, первый запуск и неизвестная identity.
- `$env:MEDIATHEQUE_EVIDENCE_DIR='docs/research/mediatheque-iphone-storage/2026-09-12/local-regression'; node scripts/premium/mediatheque-browser-smoke.cjs` → полный существующий сценарий Медиатеки, 63/63 PASS, 5000 материалов, две вкладки, reader/back, публикация только в локальной тестовой БД, offline cold boot и update service worker.
- `npm test`; `npm run test:api-smoke`; `npm run smoke:room-media`; `npm run smoke:reader-parity`; `node tests/i18n.smoke.js --write-lock` — общие гейты. Итог: npm test 1574/1574 PASS; API smoke PASS; room-media PASS; reader parity 37 leaf + 4 builder/golden PASS; i18n 233/233 PASS (locale v219). Для существующего byte-parity теста iPhone-хелпера пять неизменённых исходников временно приведены к LF-байтам HEAD и побайтно восстановлены после прогона. Генерируемые полным тестом Physics-артефакты восстановлены в чистом отдельном checkout.
- `$env:MEDIATHEQUE_EVIDENCE_DIR='docs/research/mediatheque-iphone-storage/2026-09-12/production'; node scripts/premium/mediatheque-live-smoke.cjs` — только читающие production HTTP-запросы и отдельный локальный browser-профиль. Проверяются версия 3.11.524, integrity worker/VFS и UI, завершённые reload, public reader/back и публичные снимки.

## Границы

Исходный физический iPhone-баг подтверждён владельцем. После исправления физическая приёмка ожидает повторного открытия на том же устройстве. Контролируемое воспроизведение не устанавливает конкретную низкоуровневую ошибку того iPhone.
Ни очищение браузерных данных, ни смена VFS preference, ни перенос пользовательской библиотеки для восстановления не требуются и владельцу не предлагались. Изменение preference используется только внутри явно одноразового тестового профиля для проверки двух разных хранилищ.
