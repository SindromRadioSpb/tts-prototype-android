# Ulpan Journey — состояние нативной интеграции, 2026-10-20

## Результат и источник

Пользователь утвердил доработку сценария и постановки, затем потребовал
компактные орнаментальные таблички `אולפן` и `סרט`, нативный интерфейс как
в мире выборов и явно разрешил немедленный production-выпуск.

Нативная интеграция готова локально. Рабочая копия:
`E:\projects\tts-prototype-android\.tmp\ulpan-integration`.
Это извлечённый снимок main с изменениями, а не Git worktree.
Проверенная база: `56c5b4de4ef09f4806586895136ff2cb1c7d4312` / 3.11.798.
После локальных проверок GitHub connector подтвердил, что удалённый main
всё ещё указывает на этот SHA. Перед выпуском проверить снова.

Все 31 файл результата сохранены в `integration/` с SHA-256 в
`integration-files.json`. `integration.patch` содержит diff текстовых файлов
от указанной базы, включая новые JSON, JS и тест; новые PNG лежат в
`integration/public/worlds/ulpan-journey/` и в текстовый patch не входят.
Не переносить целые старые HTML/server.js поверх изменившегося main:
применять и проверять diff, разрешать расхождения по существу.

Сборщик: `src/build_integration.py`. Он пересоздаёт свою `.tmp`-копию из
зафиксированной базы через `git show`, добавляет pack и painter, обновляет
URL движка/активности/CSS в boot, SW, integrity и оболочках. Экспорт:
`src/export_integration.py`. Эти скрипты не предназначены для выпуска
поверх произвольно изменившегося main без адаптации.

## Реализовано

- ID `ulpan-journey`, pack 1.0.0, категория «Израиль» в существующем picker.
- Семь локаций на всех трёх поверхностях: Студия, Зал, Медиатека.
- Стандартные route, pause, speech bubble; нет отдельного меню или таймлайна.
- Клик/тап и Enter по героям; продавец, мастер и учитель тоже отвечают.
- Независимая последовательность реплик каждого персонажа в каждой локации.
- 29 реплик на RU/EN/HE. Переводы авторские; независимая лингвистическая
  приёмка не заявляется.
- Фоны и исходные PNG сохранены побайтово; painter использует готовые позы.
- Компактные восточные геометрические рамки обеих табличек.
- Native pause, reduced motion, скрытая вкладка, offscreen и cleanup.
- Удержание движения существующим мостом чтения/аудио, без новой аудиосистемы.
- В pack только декларативные JSON и PNG; app-owned JS отдельно.
- Текущий default Memorial и выбор Classic сохраняются. Новый мир не
  назначается всем по умолчанию: такого решения пользователь не принимал.

## Доказательства

`reports/native/browser-qa.json`: 35 проверок, результат passed, Chrome
155.0.8059.80. Матрица: 3 поверхности × 2 ширины (1280/380) × 3 языка ×
7 локаций; актёры, клавиатура, геометрия, переключение миров, picker,
последняя команда при быстрых переключениях и удержание через audio bridge.
В `reports/native/` — 42 скриншота RU, по семи сценам каждой поверхности
и размера. Просмотрены также компактные таблички на нативных скриншотах.

57 unit checks прошли в наборах:

```powershell
node --test tests/worldEngine.test.js tests/worldSignLayout.test.js tests/sukkotWorld.test.js tests/memorialWorld.test.js tests/shellIntegrityPrecacheParity.test.js tests/shellModuleWiring.test.js tests/ulpanWorld.test.cjs
```

Браузерная проверка использовала реальные оболочки приложения, локальный
статический HTTP-сервер и изолированные профили Playwright. Backend/API,
production, физический телефон и скринридер ею не проверены. Сообщения
недоступности каталогов на скриншотах Медиатеки относятся к статическому
стенду без backend. Не выдавать эту проверку за production/API acceptance.

Для повторения браузерной матрицы на новом release checkout:

```powershell
$env:ULPAN_NATIVE_ROOT = '<release-checkout>\public'
$env:ULPAN_NATIVE_OUT = '<каталог-новых-доказательств>'
node E:\projects\tts-prototype-android\docs\research\linguistpro-worlds\2026-10-20-ulpan-journey-v6\src\native_browser_smoke.cjs
```

## Разрешение на выпуск и технический блокер

Пользователь: «разрешаю сразу выложить на прод». Это разрешение сохраняется;
повторное продуктовое согласование не нужно.

В текущей сессии `approval_policy=never`, `.git` доступен только для чтения,
обычная shell-сеть ограничена. Git add/fetch не могут записать index.lock /
FETCH_HEAD; `git ls-remote` не соединяется с GitHub. SSH-ключ недоступен,
SSH к production отклонён политикой. Chrome DevTools list_pages работает,
но new_page отклонён: `MCP tool call requires approval, but approval policy
is never`. Через readonly GitHub connector main прочитан успешно.
Production не изменялся; ветка/коммит/PR по задаче не созданы.

Владелец уже записал в пользовательский config.toml:
`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`.
В эту сессию новая политика не применилась. Продолжение должно выполняться
в новой сессии с рабочими разрешениями Git/network/SSH.

## Осталось до production

1. Прочитать правила репозитория, проверить branch/status/worktrees, сделать
   fetch и сверить актуальный main. Создать отдельный release checkout,
   сохранив чужие изменения в корневом checkout.
2. Перенести integration.patch и новые PNG, проверить хеши; сохранить
   ATTRIBUTION.md и происхождение материалов в репозиторных docs вне runtime
   pack. При изменении main адаптировать diff, а не заменять файлы целиком.
3. Назначить следующий свободный номер релиза (при неизменном main —
   3.11.799), согласовать APP_VERSION, SW, footer, module URLs, locales и
   integrity. Пока candidate сохраняет базовую версию 3.11.798 и локальные
   query pins `ulpan1`: это ещё не versioned production release.
4. Выполнить релевантные unit/browser/API/SW gates; повторить затронутые
   проверки после правок версии и исправлений.
5. Проверить production health, capacity и готовность DB/migrations до
   публикации. Координаты сервера брать только из приватного ops-файла.
   Приватный ops-файл не коммитить и не передавать внешним API.
6. Целевой commit/push main запускает Coolify deployment. Не включать чужие
   файлы или learner data. Не делать очистку Docker/backup без её границ.
7. Дождаться no-cache version/health/hash convergence; проверить picker,
   все сцены, тап по героям, pause, mobile, другие миры и три поверхности
   уже на production. Только после этого сообщать о завершённом выпуске.

Корневые `.remember/remember.md`, `docs/planning/OBSERVATIONS_LOG.md` и
`docs/LinguistPro World/` были чужими dirty/untracked файлами; не включать
их в commit. Локальный статический просмотр, если процесс жив:
`http://127.0.0.1:8179/`; новый мир выбрать в обычном picker.
