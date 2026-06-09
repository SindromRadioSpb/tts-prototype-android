# Где живут ваши данные (LOCAL_MODE / OPFS)

> **Phase 6 (2026-05-08):** локальный режим теперь стандартный — он
> включён у всех новых пользователей по умолчанию. Серверные эндпоинты
> для библиотеки/SRS/прогресса/истории больше не работают (возвращают
> `410 Gone`); единственный read-only маршрут — `/api/library/export` для
> восстановления старых данных, если кто-то ещё не успел перенести.

Ваша библиотека текстов, заметки, SRS-карточки и аудио-кэш хранятся на
этом устройстве — в приватной файловой системе браузера (Origin Private
File System, OPFS). Сервер Railway держит только stateless-сервисы
(TTS, транслитерация, DOCX-экспорт, Gemini-таблица); пользовательских
данных у него нет.

## Где это физически

OPFS — это изолированное хранилище, привязанное к origin
(`tts-prototype-android-production1.up.railway.app`). Доступ к нему
только из браузера через Web API. Файлы лежат в служебной директории
браузера, к ним нельзя обратиться через стандартный Finder/Explorer.

| Браузер / ОС            | Где физически          |
|-------------------------|------------------------|
| Chrome / Edge на Windows| `%LOCALAPPDATA%\Google\Chrome\User Data\Default\File System\` |
| Chrome на macOS         | `~/Library/Application Support/Google/Chrome/Default/File System/` |
| Chrome на Linux         | `~/.config/google-chrome/Default/File System/` |
| Firefox                 | `<профиль>/storage/default/...origin.../fs/` |
| Safari (macOS / iOS)    | внутренний контейнер; через Finder недоступен |
| Android Chrome          | `/data/data/com.android.chrome/app_chrome/Default/File System/` (требует root) |

Внутри — файл базы (`linguistpro_v1.db`) и связанные WAL/SHM-файлы. Не
открывайте их вручную — wa-sqlite использует эксклюзивные lock'и.

## Что произойдёт при «Очистить данные сайта»

«Clear browsing data» / «Clear site data» в браузере **удалит вашу
библиотеку безвозвратно**. Включая:

- все тексты, предложения, заметки;
- кэш аудио (MP3 от TTS-озвучки);
- историю просмотров и SRS-карточки;
- настройки воспроизведения.

Это **необратимо** и работает по-разному в разных браузерах:

- Chrome/Edge: «Cookies and other site data» → удаляет OPFS.
- Safari: «Manage Website Data» → выбрать сайт → Remove.
- Firefox: «Clear Data» → отметить «Site Data» / «Offline Web Site Data».
- iOS/Android: «Clear browsing data» в настройках Chrome/Safari.

Браузер также может **самостоятельно** очистить хранилище, если место
заканчивается. На большинстве устройств OPFS защищена политикой
"persistent" — но iOS Safari в фоне может вытеснять данные неактивных
сайтов.

## Резерв и восстановление (рекомендуется регулярно)

Единственный способ забрать данные с устройства или перенести между
устройствами — экспорт ZIP:

1. **Экспорт.** Library → «Экспорт ZIP (с аудио)» → сохранить файл.
   Это полная копия: тексты, заметки, аудио, метаданные.
2. **Хранение.** Перенесите файл в облако (Google Drive, Dropbox,
   iCloud), на флешку, на другое устройство. Это ваш бэкап.
3. **Восстановление.** На другом устройстве (или после очистки данных
   на этом же) откройте приложение → Library → «Импорт ZIP (с аудио)»
   → выберите ZIP → данные восстановятся.

Формат ZIP **совместим с Android-приложением**: тот же файл можно
импортировать в Android-версию через SAF (Storage Access Framework).

## Сколько занимает

Каждое предложение в библиотеке занимает ~1–3 КБ JSON в БД плюс ~30–80 КБ
MP3 на каждое озвученное предложение. Для типичной библиотеки в 100
текстов по 10 предложений — около 30–80 МБ.

В Settings/Dashboard панели виден живой счётчик `💾 X MB / Y MB (Z%)`.
Когда занято > 80%, появится предупреждение; > 95% — сохранение новых
данных будет блокироваться, пока вы не освободите место (удалите старые
тексты или экспортируйте ZIP и сделайте «Сбросить локальную библиотеку»).

## Несколько вкладок одновременно

Если вы откроете приложение **в нескольких вкладках**, появится баннер:

> ⚠️ Библиотека открыта в N вкладках. Закройте лишние.

OPFS-DB однопотоковая на запись. Несколько вкладок → или конфликт
блокировок (вторая вкладка не сможет инициализировать БД), или
рассинхронизация (одна вкладка пишет, другая видит устаревшие данные).
Закройте лишние вкладки.

## Kill switch (аварийный выключатель)

Флаг `KILL_LOCAL_MODE=1` остаётся в коде — его роль теперь служебная.
Он временно переводит клиента в server-mode, но т.к. серверные
endpoint'ы возвращают 410 Gone, в этом состоянии библиотека работать
не будет. Активировать имеет смысл только в одном сценарии: критический
баг в OPFS-режиме делает данные недоступными или ломает читаемость,
и нам нужно остановить всех, чтобы они не записали мусор. После фикса
флаг снимается и пользователи возвращаются к нормальной работе. ZIP-
бэкап в любом случае остаётся доступен через файловую систему браузера.

## Если что-то сломалось

- **«База OPFS повреждена»** — toast при запуске. Сразу сделайте ZIP-
  экспорт, потом «Сбросить локальную библиотеку» и импортируйте ZIP
  обратно. Если ZIP-экспорт не работает — пишите разработчику и
  приложите console-лог `window.v3OpfsTelemetry.list()`.
- **«Этот таб в режиме только-чтение»** — закройте лишние вкладки.
- **Зелёные маркеры аудио серые** — DevTools → Application → Storage →
  Clear site data **только для аудио-кэша Railway** (не OPFS) → перезагрузите.

## Частые вопросы

**Сервер видит мои тексты?**
Нет. В LOCAL_MODE ничего не уходит на Railway, кроме stateless-вызовов:
TTS-синтез (текст → MP3, MP3 кэшируется), translit-сервис, DOCX-builder.

**Я в командировке без интернета — приложение работает?**
Да, после первой загрузки страницы. Тексты, заметки, прогресс — всё
локально. Не работают только: TTS-синтез нового аудио (нужен сервер),
импорт из облака, экспорт DOCX.

**Можно ли синхронизировать между двумя устройствами автоматически?**
Пока нет. Передача через ZIP-экспорт/импорт. Cloud sync — на дорожной
карте (post-Phase-6).

---

## Server endpoints после Phase 6 cleanup

| Endpoint                                             | Состояние |
|------------------------------------------------------|-----------|
| `POST /api/transliterate`                            | ✅ работает (stateless) |
| `POST /api/export/docx`                              | ✅ работает (stateless DOCX builder) |
| `POST /api/audio/cache/upload`                       | ✅ работает (audio cache) |
| `GET /api/audio/:assetKey`                           | ✅ работает (audio serving) |
| `POST /api/audio/prefetch/*`                         | ✅ работает (batch TTS) |
| `POST /api/tts`, `/api/tts/hebrew-local`             | ✅ работает (TTS proxy) |
| `POST /api/translate-table`, `/api/translate-table-v2` | ✅ работает (Gemini table builder) |
| `POST /api/niqqud`                                   | ✅ работает (восстановление огласовок) |
| `GET /api/client-config`                             | ✅ работает (feature flags) |
| `GET /api/library/export`, `/api/library/export/bundle` | ✅ работает (last-mile recovery старых данных) |
| `GET/POST /api/library/texts`, всё под `/api/library/texts/:id/*` (кроме export) | 🚫 410 Gone |
| `GET/POST /api/srs/*`, `/api/srs/export/anki/*`      | 🚫 410 Gone |
| `GET/POST /api/progress/:textId`                     | 🚫 410 Gone |
| `POST /api/history/event`, `GET /api/history/recent-*`, `/api/history/analytics`, `/api/history/texts/:id/recent-rows` | 🚫 410 Gone |
| `GET /api/notes/search`, `/api/sentences/search`, `/api/nav/resolve` | 🚫 410 Gone |
| `POST /api/library/import`                           | 🚫 410 Gone (используйте «Импорт ZIP» в UI) |

Если вы ещё не перенесли старые данные с сервера — откройте сайт,
прими prompt «Перенести данные с сервера» (он использует `/api/library/export`
read-only и переливает в OPFS).

## D2: Server endpoints — header trust audit

В LOCAL_MODE сервер обрабатывает три stateless POST-вызова. Каждый из
них использует разный механизм доверия:

| Endpoint                      | CSRF guard                | Content-Type guard | Per-IP rate limit |
|-------------------------------|---------------------------|---------------------|---------------------|
| `POST /api/transliterate`     | `requireSameOriginJson`   | application/json    | 60/min            |
| `POST /api/export/docx`       | `requireSameOriginJson`   | application/json    | 30/min            |
| `POST /api/audio/cache/upload`| `requireAudioUploadAuth` (owner-token `X-Audio-Upload-Token`; loopback only if token unset — BRR-P0-010; X-Local-Mode no longer authorizes) | application/json | 2000/min + 20-fail/10min |

`requireSameOriginJson` отклоняет запросы:
- с `Content-Type` не `application/json` → 415;
- с `Origin` не совпадающим с `host` → 403 (CSRF-mitigation для браузера);
- если `Origin` отсутствует, проверяется `Referer` (server-to-server клиенты типа Android v2 без обоих заголовков допускаются — они не подвержены CSRF).

Кроме CSRF-защищённых endpoint'ов, **никаких других пользовательских
данных на сервер не отправляется** в LOCAL_MODE. Сервер не хранит
тексты, заметки, прогресс. Stateless эндпоинты — purely-deterministic
вычисления (transliterate) или преобразования формата (DOCX).

См. также `docs/OPFS_MIGRATION_PLAN.md` — техническое описание реализации.
