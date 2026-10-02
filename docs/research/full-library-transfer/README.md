# Полный перенос библиотеки — доказательства

Дата: 2026-10-02. Baseline: `origin/main` / `0bb7bead`, shell 3.11.717. Реализация: shell 3.11.718.

## Проверки

- `node scripts/test-unit.js`: 2343/2343 PASS после изменения writer boundaries и release pins; дополнительная структурная ZIP64 проверка 6 GiB прошла затем в core 11/11.
- `node tests/i18n.smoke.js`: 233/233 PASS.
- `node scripts/api-smoke.js`: PASS, отдельный сервер без provider credentials.
- `node scripts/premium/library-transfer-browser-smoke.js`: [локальный отчёт](2026-10-02/local/browser-evidence.json), RU/EN/HE 380px и desktop screenshots рядом.
- `LIBRARY_TRANSFER_BASE_URL=https://linguistpro.kolosei.com node scripts/premium/library-transfer-browser-smoke.js`: тот же синтетический roundtrip на production в отдельных чистых browser contexts; отчёт сохраняется в `2026-10-02/production/`.

Browser oracle независимо экспортирует исходные данные и сравнивает восстановленные строки, private note/progress, структуру, caption mapping и несохранённый ASR draft. Два профиля голоса используют одинаковый MP3 payload; native и legacy text используют один исходный MP4. После reload и перехода offline проверяется декодирование, реальный `play()` и seek на 1000ms, а также обе ссылки MP3. YouTube timing/offset сохраняются после ручного исключения локального файла; доступность самого YouTube ролика этим fixture не проверяется. Preview повреждения и недостаточного места сравнивает все SQLite tables до/после. Foreign notebook consent проверяется до первых записей. UI проходит prepare/save/owner-saved receipt.

Большие файлы копируются порциями до 4 MiB. ZIP64 structural test использует виртуальный 6 GiB payload и реальные ZIP headers/offsets без выделения 6 GiB памяти; это не физический multi-gigabyte device stress test. Физические iPhone/Safari owner tests в данный срез не входят.

## Исходный архив владельца

Read-only inventory ZIP: 644 текста / 85404 строки / 65 canonical learning packages / 9106 MP3. 123 MP3 отсутствовали. Все 65 пакетов отмечали `media_included:false`. Личная структура Медиатеки и отдельные native ASR workspaces отсутствовали. Текущий профиль: 76 native packages, включая 13 unpromoted workspaces. Старые text passports дополнительно содержали media references до введения canonical packages. Проверены CRC внешнего ZIP и SHA payloads внутренних packages. Existing ZIP не изменялся; его содержимое не расширяется от обновления программы — нужен новый экспорт.

## Разрешённая очистка

До сборки удалены только два старых LinguistPro image ID, не имеющие ссылок от любых контейнеров (включая stopped): `614887af92cf` / `39c01df4fb55`. Текущий image `0422230b54cf` сохранён. До/после: 12 running containers, 4 volumes; images 13 → 11; свободное место 1.4G → 3.2G, df 97% → 92%. Build cache, containers, volumes и пользовательские файлы не удалялись. `/healthz` остался ready. Disk warning ещё активен; снижение процента не объявляется устранением capacity risk.

## Production

До финальной записи rollout verification: NOT YET VERIFIED. Нужны convergence контейнера, повторные version/health/served-asset SHA checks и production browser roundtrip.
