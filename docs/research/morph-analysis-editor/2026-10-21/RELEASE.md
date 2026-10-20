# 3.11.805 — выпуск редактора разбора в строке

Дата: 2026-10-21. [Контракт](../../../planning/MORPH_ANALYSIS_EDITOR_2026_10_21.md), [реализация и локальные проверки](IMPLEMENTATION.md).

## Код и CI

- Реализация: `f84d7b0d`; PR [16](https://github.com/SindromRadioSpb/tts-prototype-android/pull/16), merge `783dd512`. Полный PR CI [39515566644](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39515566644) — success.
- Main CI `39516365906` выявил гонку прежнего API smoke: HTTP liveness предшествовал готовности временной SQLite. Экспорт проверялся слишком рано. Исправление стенда `75899c50`, PR [17](https://github.com/SindromRadioSpb/tts-prototype-android/pull/17), merge `bf4af1b3`. PR CI [39516810843](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39516810843) — success: 2781 passed, 2 platform skips, 0 failed из 2783; API, migration, import, tenant isolation, FSRS, material lifecycle и все browser gates прошли. Отдельно локально 5/5 helper tests и API smoke.
- Main CI [39517478901](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39517478901) — success; исправленный readiness gate и все последующие browser gates прошли.
- `public/` и `server.js` в `783dd512` и `bf4af1b3` идентичны. Последующее обновление содержит только исправление тестового стенда и описание результата; версия UI остаётся 3.11.805.

## Production acceptance

- Работает контейнер commit `bf4af1b324b5344dfbf840f3ababb587d33a8eee`, image `8b4842685f62`. Сохранены предыдущий 3.11.805 `3cc1d56bc89b` и предыдущий функциональный 3.11.804 `4b951c98d3b8`.
- После первого rollout три no-cache проверки версии, SW/Studio stamp, health/DB/migrations и SHA-256 всех шести изменённых JS/CSS/locale assets прошли. [Результат](production-verification.json).
- Реальный public-work «Хаммам, серия 2», строки 22/26, проверен в одноразовом Chromium без mocks публикации. שֶׁפָּחַדְתָּ → לפחוד / pid1612 / PERF-2ms; נוֹתַר → להיוותר / pid867 / PERF-3ms. У каждой формы один реальный кандидат; редактор изначально закрыт, Save скрыт до выбора, действие имени доступно внутри редактора. Review/lexical history неизменны; 0 paid calls и page errors. Просмотрено 380/1280, без горизонтального переполнения.
- Скриншоты: [строка 22, 380px](production-21-380.png), [строка 22, desktop](production-21-1280.png), [строка 26, 380px](production-25-380.png), [строка 26, desktop](production-25-1280.png). Для снимков фокус возвращён к началу диалога и отключена анимация; после раскрытия редактора браузер мог сохранять прокрутку у summary.
- После второго rollout повторены три проверки версии 3.11.805, DB/migrations readiness и точных хешей тех же шести assets: [финальный сервис](final-service-verification.json). Полный браузерный сценарий повторно не запускался: код приложения идентичен первому прошедшему rollout.
- Подключённый owner-профиль использован только read-only: до/после review_log 11751, SHA-256 `84fe1a570fc2a49baf4e702b929d734354a4ce9fb9473d6041d2f42527e30ccd`; lexical_resolution_events 29, SHA-256 `c0351ab477d543cf0b04b1eef6b86825f4bbd220f2e2c97b4e232bf685f696fc`. Протокол: JSON.stringify полных строк SELECT ORDER BY id. Пробных исправлений в профиле владельца нет.

## Ёмкость хоста

Первый preflight: 6.0G / 84%, cache 0; после первого rollout 2.8G / 93%, cache 2.691GB. Второй preflight с тем же резервом ошибочно считал переиспользование cache достаточным для тестового изменения. Во время упаковки нового образа свободное место дошло до 0 / 100%. Попытка отменить повторную сборку через UI не успела остановить завершение образа/rollout (Kapture click timeout); контейнер обновился. После удаления временного build helper средствами Coolify осталось 406M / 99%. Сервис, DB и migrations ready, `disk_warn=true`.

Свежая инвентаризация после обеих сборок: 15 images, 11 running containers, 4 volumes, build cache 4.507GB (private/reclaimable по system df около 1.98GB). После отдельного разрешения владельца выполнен **только** `docker builder prune -af`. Build cache теперь 0 B. По `df` доступно 3 974 832 128 байт вместо 425 713 664 (+3 549 118 464 байт); занято 90%. Docker сообщил 4.507GB logical cache reclaimed. Наборы всех 15 image IDs, 11 running container IDs и 4 volumes совпали до/после, current/rollback сохранены: [проверка очистки](cache-cleanup-verification.json). После очистки три повторных no-cache пробы подтверждают 3.11.805, точные asset hashes и DB/migrations readiness; `disk_warn=true` остаётся при пороге 80%, непосредственный дефицит устранён. Перед последующей сборкой нужен новый проходной capacity preflight с запасом на упаковку/распаковку, без предположения, что cache гарантирует малый пик. Риск O-055/O-047 остаётся открытым.
