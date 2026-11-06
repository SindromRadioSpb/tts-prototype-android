# Atlas 97001 — production 3.11.870

Выпуск утверждён владельцем после локальной приёмки; отдельные разрешения получены на два архива, helper image и exact build-cache. AI-слой не создавался.

## Выпущенный код и данные
Commit: 8b47ab75a54462753e93e4be021c95e5f0b7ef01. Это merge актуального main869 в ef4e0bc6; дерево отличается от проверенного кандидата только добавленным README подготовительной стадии. Production обслуживает 3.11.870.
Coolify deployment a93e9ybtaoordwg6yc12sts4 finished 2026-11-06 23:33:23 UTC.
Image sha256:e004ceb0cfb12ff3143228bdcf4355cb037b08f20ad00bdac63339331b0ed60f.
CI exact commit: https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/42312170516 — все три jobs success.

Immutable edition 50253381cb255822678b07e0ed41a608a3a701a661527eb796837b2f3ee64edc установлена в отдельный namespace. 845 файлов проверены перед rename; manifest SHA256 085d33fddbd04a1eaaa4a9e625273591683cdcf9ff19d0b16899d503132ada7a. Все 843 manifest entries дополнительно сверены по размеру/SHA через production HTTPS. Старый atlas namespace сохранён.

## Production evidence
- 12 shell/module ресурсов совпали с git commit, включая SW, exporter, worker, reader и edition client.
- Активный service worker 3.11.870; страницы 122/178 имеют split children, исторический parent122 сохранён как отдельная группа. Page errors: 0.
- Первый пустой профиль не дождался controller за 90 секунд. Прогон сохранён как failed; диагностический повтор прошёл без изменения кода или ослабления проверки. Причина первого таймаута не установлена; это отдельное наблюдение о времени первой установки, не доказанная порча данных.
- 1280/390 px: скан122 загружается, горизонтального переполнения нет, поиск «масса» — 23 результата и успешный переход. Reader/Words/Train/Search contract согласован, find-bank ready. Скриншот390 просмотрен.
- Три no-cache health samples: ok, DB ready, migrations ready.
- После deployment: 945 legacy SHA, metadata 80 backup files, 4 volumes, 8 остальных контейнеров и все предыдущие образы сохранены; app mounts прежние.

Это anonymous synthetic-profile browser evidence; не owner-live проверка всех записей, не physical iPhone и не личная вычитка. Реальный локальный экспорт владельца прошёл verifier, но все счётчики нулевые; владелец не уверен, была ли история. Это ограничение было раскрыто до утверждения выпуска. История владельца не импортировалась и не редактировалась.

## Ёмкость и rollback
После отдельного согласия удалён только cache 8stj86ot787o8pv4vmyq1kt6g, 888737792 B, InUse=false/Shared=false. Остальной cache/image/container/volume inventory сохранён. До push после staging available=8015265792 B; после резерва512MiB и полного helper702128765 B остаётся6776266115 B (>6GiB).
После сборки available=3203915776 B. Это не запас для следующей cold build: перед следующим выпуском нужен новый capacity gate. Дополнительная очистка не выполнялась.
Rollback code: 869 commit0977606530f5c03823c803d1ab7b35be38a7eeec/image b5facea0461f8d7e38222fdc121ad7f20c6d87e43d5ca2c75cc70497221b92a8; также сохранены867/866/865/864. При rollback сохранить immutable namespace для новых клиентов и основной volume; learner DB не откатывать.
11 held groups, 10 disputed decisions, 108 nonlearning rows, 20 source limits сохранены. AI-слой требует отдельного решения после личного просмотра.

Локальные полные логи, inventories, hashes, скрипты и screenshots: Архив/atlas97001-release-870. Owner snapshot в пакет выпуска не включён.
