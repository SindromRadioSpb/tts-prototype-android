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

До сборки удалены только два старых LinguistPro image ID, не имеющие ссылок от любых контейнеров (включая stopped): `614887af92cf` / `39c01df4fb55`. Работавший image `0422230b54cf` сохранён до успешного переключения; после штатного удаления старого контейнера Coolify повторно проверены все container refs и этот разрешённый резервный образ удалён отдельной командой. Новый runtime image `698da868a6de` сохранён. До/после: 12 running containers, 4 volumes; images 13 → 11; свободное место 1.4G → 3.2G, df 97% → 92%. Build cache, containers, volumes и пользовательские файлы не удалялись. `/healthz` остался ready. Disk warning ещё активен; снижение процента не объявляется устранением capacity risk.

## Production

**PASS**, deployment queue 2591 / commit `db42438c39d89fad781b1c7d52d2856aa4509aa0`, Coolify finished 2026-10-02 16:36:10 UTC. Runtime image `698da868a6de8bf9e1a4a0fff263dd62740800868effb0b3de6866b77326b6ec`. [Три no-cache served-assets проверки](2026-10-02/production/served-assets.json), [production browser roundtrip](2026-10-02/production/browser-evidence.json).

Во время rolling update build headroom был исчерпан (df 100%, временный health 502). Штатное завершение сборки удалило build helper и старый app container; затем безопасно удалён старый image без container refs. После rollout: 12 running containers, те же 4 volumes, 1.4G available / 97% used. DB/migrations health ready. Build cache не очищался. Для следующего deploy прежняя capacity problem сохраняется; требуется отдельно согласованное увеличение места или cache cleanup.

Платные provider calls: 0. Owner source ZIP не изменён. Проверки получателя выполнялись только в disposable browser profiles.

## Owner read-only coverage

[Текущий профиль](2026-10-02/production/owner-readonly-inventory.json): 644 текста / 76 workspaces / 70 уникальных media, 68 available / 2 missing, 22 809 599 138 bytes available, 92 legacy uses, 10510 audio links. Learner signal и review count (7802) до/после совпали. Генерация нового 22.8 GB архива и восстановление поверх owner данных не выполнялись. Timing verification отключена только в этом read-only coverage probe; обычный экспорт проверяет timing basis и exact binding. Крупный экспорт в background вкладке медленнее; чтение завершилось после foreground resume.
