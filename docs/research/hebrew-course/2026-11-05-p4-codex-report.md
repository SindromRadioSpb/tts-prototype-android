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
