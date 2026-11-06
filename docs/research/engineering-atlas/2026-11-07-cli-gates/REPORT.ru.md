# Atlas 97001 — локальная приёмка gates, 7 ноября 2026

## Область и точный кандидат
База production/preparation: 0977606530f5c03823c803d1ab7b35be38a7eeec (869).
Структурный runtime: 7d4a514a244cbbbfd439e1d0475fb1c0206f473d (870).
Legacy fixture: a8268fd28029d5f8941d2601f7cfdcf18cbdd833 (867), отдельный detached worktree.
Изменение текущей сессии — только тестовый runner: выбор отдельного Playwright и создание нового synthetic persistent profile внутри out. Продуктовый код, SHA/contract checks и данные edition не менялись. Ветка feat/atlas97001-structure-v2 остаётся локальной; push/deploy запрещены.

## Экспорт владельца
Штатная кнопка 869 через разрешённый пользователем Kapture; файл остался локально:
C:\Users\lletp\Downloads\atlas97001-progress-2026-11-06T23-09-38-419Z.json
SHA256 a8371bec521ab165f91f5aaaf297e21706c2a65bad6a53a85ef50a12de4475c2.
verify-progress-snapshot.cjs прошёл в новой SQLite :memory: против immutable edition 50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc.
word_status/review_log/find_history/find_stale = 0/0/0/0. Проверка пустой копии не доказывает сохранность ожидаемой ненулевой истории. Вопрос владельцу об ожидаемом нуле открыт; release gate нельзя объявлять безусловно закрытым. Raw browser storage/SQL/credentials не читались. Прямого сравнения всей исходной базы не было; read-only гарантии опираются на штатный exporter/worker. Snapshot не включён в отчёт или git.

## WebKit: причина и проверка
Минимальный static-loopback reproducer cache-reload.cjs без приложения и SW воспроизвёл потерю CacheStorage после reload в Playwright 1.60.0 / WebKit 2287: match false, повторный put не помогает, delete возвращает true. Chromium проходит.
В отдельном окружении Playwright 1.62.0 / WebKit 2336 persistent-контекст проходит тот же тест; ephemeral-контекст по-прежнему теряет запись.
Подтверждение upstream: https://github.com/microsoft/playwright/issues/41618 и https://github.com/microsoft/playwright/pull/41701 — ошибка persistence encoder ResourceResponseData; ephemeral cache не предназначен для такой проверки сохранности.
Полная матрица на новом synthetic persistent профиле, с отключением loopback transport: 15/15, errors=[]; включая interrupted install/retry, old/new SW/cache, Back/Forward/reload, offline/online, SHA rejection, несовместимый word layer и rollback. Это локальное автоматическое evidence; не physical Safari/iPhone и не owner acceptance.
Артефакт: .tmp/atlas97001-structure-v2-package/edition-webkit162-persistent-full/report.json; сохранён также рядом с этим отчётом. Не применялась очистка/перезапись кеша для прохождения полной матрицы.

## Проверки
npm test: 3493 total, 3491 pass, 2 skip, 0 fail.
Python: 209 total, 12 skip, OK. NODE_PATH включает atlas97001-upgrade/test-deps/node_modules (katex); PYTHONPATH включает scripts/atlas/tests для существующего sibling import test_validate. Первый запуск без этих путей не прошёл; код ради него не меняли.
Целевые три node test файла: 16/16 pass (фактическое число текущего runner, не исторические 36).
API smoke повторно не запускался: API/runtime не менялись; предыдущие результаты относятся к 7d4a514a и изложены в передаче.

## Ёмкость и явно разрешённые удаления
После отдельного разрешения владельца удалены только app-data-20261104-030001.tar.gz и app-data-20261105-030001.tar.gz. Перед удалением сверены exact пути, размер, inode/mtime, nlink=1; архив 6 ноября и milestone сохранены.
В рамках отдельного разрешения очистки образов удалён только неиспользуемый coolify-helper:1.0.19 (sha256:b0cf60e6d6ecc73696811fe105d7b187b0fa387bd8ec62c647177420daf42bad), без force. Проверены отсутствие ссылок всех контейнеров, активных builds/cache; manifest amd64 и HEAD всех 8 blobs доступны в Docker registry. Фактический restore/pull не выполнялся; будущая доступность registry не гарантируется.
Build cache не удалялся. Текущий 869 и rollback 867/866/865/864 сохранены. Retention не менялся (daily 7 дней, full 14 дней); milestone не трогали.
Финальный замер 2026-11-06 23:21:39 UTC: available 7211593728 B, reserve 536870912 B, after reserve 6674722816 B; gate 6442450944 B пройден, запас 232271872 B. Нет активных/queued builds. Production 869 healthy, DB/migrations ready.
Сверены 945 legacy file SHA, metadata 80 оставшихся backup files, все контейнеры/volumes и 5 reader components. Изменений нет.

## Rollout / rollback и решение
870 НЕ опубликован. Перед решением: подтвердить смысл пустого owner snapshot; рассмотреть точный локальный commit; повторить capacity/build preflight непосредственно перед rollout, запас невелик и следующий backup/build его изменит.
Использовать edition-data-v2, manifest SHA 085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a, 843 manifest entries, 845 файлов с manifest/READY. Сохранять legacy paths и immutable namespace для старых/новых клиентов. После разрешённого выпуска проверить served version/assets/SW и affected flow.
Rollback — только код к 869 либо сохранённому 867; immutable namespace оставить для уже обновившихся клиентов, основной volume и learner DB не откатывать.
11 held groups, 10 disputed decisions, 108 nonlearning rows, 20 source limits не изменялись. Личная вычитка владельцем и AI-слой остаются отдельными gates; AI не создавался.

## Воспроизведение
Из structural worktree запустить scripts/atlas/edition-browser-smoke.cjs с --legacy exact867, --preparation preparation869, --edition-root edition-data-v2/atlas-editions, новым --out, --engine webkit --offline-mode transport --persistent yes --playwright-module ABSOLUTE_PATH_TO_PLAYWRIGHT_1_62. PLAYWRIGHT_BROWSERS_PATH указывает на отдельный каталог с WebKit2336. Не использовать owner profile. Не задавать --skip-install-interruption или --cache-probe для acceptance.
Локальные operational JSON и логи: Архив/atlas97001-cli-handoff-20261106. Snapshot хранится только по указанному пути Downloads.
