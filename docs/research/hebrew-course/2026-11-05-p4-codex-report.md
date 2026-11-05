# P4 — звук урока: отчёт Codex

Дата: 2026-11-05. Ветка `feat/course-audio`, база `origin/main` `7bb3f4f9` после выпуска P3. Worktree: `.worktrees/course-audio`.

## Область и границы

Task 1–4: инструменты сборки звука, проверки и владелецкий лист прослушивания. Страницы приложения, версии и production не меняются. Task 5 Step 3 выполняет владелец; доставка MP3/данных на production требует его отдельного «да». ASR не заменяет прослушивание.

## Реализация

- `bc556f05`: `CourseSpeech` извлекает точный `he.niqqud`, задаёт профиль `he-IL`, rate 1, pitch 0, разрешает WaveNet A–D; по умолчанию staff C, остальные D, абзацы C. Валидация voice и лимита 4800 UTF-8 байт. Тест изменения ключа при изменении текста.
- `6e49fc13`: offline inventory, ключ `computeAssetKey`/`row`, возобновляемый bake MP3 24 kHz, атомарные файлы и журнал SHA-256, hard ceiling 50 000 символов недостающих уникальных запросов до synthesis calls. Ошибки провайдера не выводятся. Credentials только через окружение дочернего процесса.
- `fb27fd7f`: локальная сверка ffmpeg PCM → Whisper (CPU int8 по умолчанию), уже установленная модель Компаньона, без скачивания и удалённого ASR. `tailSilenceDb` — RMS последних 100 ms в dBFS, floor -120, не длительность тишины. Самостоятельный русский HTML: RTL, относительные MP3, ASR совпадает по ref/key, явные оценки и заметки. По умолчанию всё непрослушано.
- `f92a7d62`: manifest допускает только `ok` с актуальным ключом; stale refs перечисляются; отсутствующий review даёт пустой manifest, неверный lesson отклоняется. Исходные отметки сохраняются. Сборщик снова пересекает manifest с approval и текущим ключом, копирует audio JSON и хеширует точные выходные байты.

Каждая задача выполнена с тестами сначала RED, затем GREEN и отдельной проверкой соответствия плану/качества; ветка пушится после задач. Для ясного разделения тесты листа и манифеста вынесены в `courseListeningSheet.test.js` и `courseAudioManifest.test.js`, вместо роста двух файлов из исходного плана. Общие безопасные directory checks выделены в `course-files.cjs`; approval-логика в `course-audio-manifest.cjs`.

## Проверки

- Task 1: RED 7/7; GREEN speech+format 18/18.
- Task 2: RED 5 новых тестов; GREEN speech+TTS 15/15, отдельно red/green восстановления пропущенной записи журнала. CLI TTS 8/8.
- Task 3: RED отсутствующего builder; GREEN sheet+TTS 9/9, JSON кнопки исполнен через linkedom. Python syntax и help проверены. Chromium: 8 audio, 8 RTL, все оценки непрослушаны; визуальный просмотр листа.
- Task 4: RED 9/9; GREEN manifest+TTS+sheet+data 26/26.
- Первый полный набор: 3259 total / 3257 pass / 0 fail / 2 skipped.
- Итоговый reviewer дополнительно обнаружил допустимую ранее коллизию ID реплики и абзаца. Требуется общий namespace spoken IDs, чтобы refs/approval/manifest не смешивали записи; исправление и окончательные результаты ниже.

## Команды оператора

Из worktree:

```powershell
node scripts/course/course-tts.cjs inventory tests/fixtures/course/mini --lesson L001-cafe --out .tmp/course-tts/inventory.json
node scripts/course/course-tts.cjs bake tests/fixtures/course/mini --lesson L001-cafe --out .tmp/course-tts --concurrency 2
python -I scripts/course/course-asr-check.py .tmp/course-tts .tmp/course-tts/inventory.json
node scripts/course/course-tts.cjs sheet tests/fixtures/course/mini --lesson L001-cafe --out .tmp/course-tts
```

`inventory --out` — путь JSON; для поиска MP3 в другом каталоге есть `--audio-dir`. В bake/sheet `--out` — каталог MP3. `PROFILE_ID=course-he-wavenet-v1`. Ключи и содержимое credentials в отчёт не включаются.

## Пилот и следующий шаг владельца

Inventory «Кафе»: 8 реплик, 194 символа, WaveNet C/D. Путь существующих Google credentials передаётся из локальной операторской настройки `.env` основной копии только в окружение отдельного процесса. CLI сам `.env` не загружает. Итог пилота приведён ниже.

## Итоговая правка и проверка кода

`1c053d6b` устраняет коллизию spoken ID: абзацы используют общий набор ID с репликами; ID заданий остаются отдельными, а audioTurnId не начинает принимать ссылки на абзацы. Два регрессионных теста сначала упали по ожидаемым причинам; после правки затронутые проверки **38/38 PASS**. Повторный полный `npm test -- --test-reporter=dot` завершился **exit 0**; reporter не печатает итоговые счётчики. Финальное spec/quality ревью одобрило интеграцию. После каждой Task1–4 ветка опубликована, последний кодовый SHA `1c053d6b2626b0e34973bdfae8776e2d0861f17a`.

## Task 5 — выполнение до владельческого прослушивания

- Синтез реальным Google TTS: ceiling этого пилота **194**, concurrency2, **made8/skipped0/failed0**. Только огласованный текст и WaveNet C/D; 108096 bytes суммарно.
- Все восемь файлов: ffprobe **MP3/24000Hz**, длина и SHA-256 совпадают с журналом. Повторный offline inventory: **missingChars0**, haveFile=true для всех8.
- Путь локальных записей и страницы: `.worktrees/course-audio/.tmp/course-tts/`. Ключи credentials не копировались, не печатались, не попадали в git/отчёты; существующая настройка использована только для окружения пилотного дочернего процесса.
- Локальный ASR (установленный Python окружения ASR Tool + модель Компаньона, CPU int8): **8/8 exact**, общая декодированная длительность **13.512s**, tail RMS от -85.12 до -81.79 dBFS. Это проверка текста, не носительская/слуховая приёмка.
- Chromium открыл окончательный лист и загрузил метаданные всех8 MP3. Playback не запускался, все оценки остались непрослушанными. Страница визуально проверена; русский UI/RTL корректны. [Скриншот](2026-11-05-p4-audio/listening-sheet.png), [browser check](2026-11-05-p4-audio/browser-check.json).
- Доказательства: [inventory](2026-11-05-p4-audio/inventory.json), [журнал synthesis](2026-11-05-p4-audio/bake-log.json), [локальный ASR](2026-11-05-p4-audio/asr-check.json), [ffprobe/hash verification](2026-11-05-p4-audio/audio-verification.json). MP3 остаются локальными, в git не добавлялись.

### Что делает владелец

1. Открывает локальный файл `.worktrees/course-audio/.tmp/course-tts/listen-L001-cafe.html` в браузере. MP3 лежат рядом, перемещать HTML отдельно от них нельзя.
2. Прослушивает каждую запись, выбирает «Годится» или «Проблема», при необходимости пишет заметку, нажимает «Скачать отметки».
3. Передаёт скачанный `listen-L001-cafe-marks.json` агенту. До этого accepted manifest и production bundle не создавались. Ранее прослушанный исследовательский набор не подменяет эти новые явные отметки.
4. После получения marks агент формирует manifest/build на отдельной копии исходного курса (для production id=ulpan), готовит точный набор файлов к доставке. Доставка только после отдельного «да» владельца. Проверки production (audio200, ▶, 0.75×, stop on exit) пока **не выполнялись**.

Task1–4 завершены. Task5 Step1–2 завершены, Step3 ожидает владельца, Step4–5 не разрешены/не выполнены. Отчёт пока в feature-ветке; итог Task5 в main с `[skip cd]` будет опубликован после владельческой приёмки/разрешённой доставки. Main и production в этой работе не менялись.

## Приёмка владельца и доставка на production

Владелец передал `listen-L001-cafe-marks.json` со словами «всё годится», затем явно подтвердил: **«подтверждаю доставку на прод»**. Дата 2026-11-05, reviewedAt из файла `2026-11-05T07:07:25.607Z`.

- [Исходные отметки](2026-11-05-p4-audio/owner-marks.json): **8 ok / 0 bad**, все8 ключей совпадают с текущими исходниками и готовыми MP3. Manifest: approved8, stale[]. Task5 Step3 завершён владельцем.
- На отдельной локальной копии fixture установлен course.id=ulpan; создан [принятый audio manifest](2026-11-05-p4-audio/accepted-audio-manifest.json) и [bundle manifest](2026-11-05-p4-audio/delivered-course-manifest.json). Четыре исходных JSON совпали побайтно с опубликованными файлами; повторно проверены на сервере перед записью.
- Доставлены восемь MP3 в persistent `audio-cache`, добавлен `course/ulpan/audio/L001-cafe.json`, атомарно обновлён manifest курса (5 hashed files). Старый manifest сохранён в отдельном staging каталоге сервера для отката. Существующие course.json, lexicon и lessons не перезаписывались. Учётные данные/ключи в публикацию не включались.
- Это **доставка данных без runtime deploy**: production остался **3.11.856**, runtime `6e4e336a`, последняя сборка3007 finished. Никакие страницы/версии не менялись. Перед доставкой свободно5.43GiB, cache0, активных сборок нет; около108KB MP3 не требуют Docker build. Очистка не выполнялась. После доставки свободно5.43GiB, все4 volumes сохранены; disk_warn=true остаётся, следующий runtime build потребует свежего capacity gate ≥6GiB.
- HTTP проверка: **8/8 GET /api/audio/<key> →200 audio/mpeg**, все SHA-256 совпали с локальными принятыми MP3. Все5 файлов данных совпали с manifest по HTTP и на томе. Три свежих health-запроса: ok, DB и migrations ready.
- Production Chromium, отдельный owner-профиль390×900, Classic, serviceWorkers:block: «Кафе», **8 кнопок ▶**, настоящее HTMLAudio проигрывание с muted output; скорость **0.75** после повтора; прежний экземпляр остановлен и src удалён; «К урокам» останавливает звук. pageErrors=[]. Ответы/словари/повторения не изменялись. Серверный review_log **12063→12063**.
- [Production verification](2026-11-05-p4-audio/production-verification.json), [production screenshot](2026-11-05-p4-audio/production-cafe-390.png), снимок просмотрен. Не заявляются проверенными физический iPhone, активный SW/offline и весь курс. Слуховая приёмка выполнена владельцем отдельно от muted browser smoke.

**Итог:** Task1–4 и Task5 Step1–5 завершены в пределах пилота «Кафе». Отчёт с доказательствами публикуется в feature-ветке и отдельно в main с `[skip cd]`; инструменты P4 остаются в `feat/course-audio` для приёмки Claude, runtime-деплой этим отчётом не запускается.
