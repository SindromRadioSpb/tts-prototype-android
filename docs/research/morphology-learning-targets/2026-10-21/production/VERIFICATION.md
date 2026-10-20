# Production 3.11.804 — выбранные учебные цели

Дата: 2026-10-21 (Asia/Jerusalem). [PR #15](https://github.com/SindromRadioSpb/tts-prototype-android/pull/15), release commit `b3ebc514169a9f6039653316cfbeea2e7b461a05`, image `4b951c98d3b8`. Проверка завершена. Это automated production evidence + read-only owner acceptance; физическое устройство и assistive technology не проверялись.

## Схождение выпуска

- Coolify: Success, 2026-10-20 22:41:08–22:45:17 UTC, 4m09s. Новый контейнер запущен, старый рабочий образ сохранён для отката.
- [CI PR](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39509112758) и [CI main](https://github.com/SindromRadioSpb/tts-prototype-android/actions/runs/39509893230) — success. Включают новый browser gate, проверки переноса, независимых вкладок, replay, приватности и SW.
- `/api/client-config` повторно отдаёт 3.11.804. SHA-256 всех 181 проверенных ресурсов совпал с Git blobs release commit; опубликованный integrity manifest совпал с ними. Проверяются versioned URL, новые модули, локали, оба shell, dictionary и SW: [результаты](served-assets.json). Windows CRLF рабочего файла не использован как эталон — сравнение ведётся с байтами коммита.
- Финальный `/healthz`: `ok=true`, DB и migrations ready, `disk_pct_used=84`, `disk_warn=true`. Порог предупреждения в приложении — 80%, поэтому предупреждение о ёмкости сохраняется (O-055).

## Поведение

- Реальный public-work «החמאם 2 — Хаммам, серия 2», строка 22, отдельный чистый профиль: источник → לפחוד / «бояться, опасаться, страшиться» → שֶׁפָּחַדְתָּ / «что ты боялся» → «Учить эту форму». Подпись палитры: «Мой статус слова: לפחוד …». Ключ палитры `pid:1612`, доступно включение `ft1:1612:PERF-2ms:sh`. Проверено при 1280/380 px, без overflow; ошибок страницы и платных вызовов нет, review_log не менялся: [лог](public-work.jsonl), [desktop](hamam-1280.png), [mobile](hamam-380.png).
- Опубликованные JS/CSS Зала и Студии, синтетические предложения и одноразовые OPFS: явное включение, независимые статусы/FSRS, два варианта будущего чтения, rollback ошибки записи, закрытие до async-ответа, клавиатура, ru/en/he, полная форма ответа, сохранение истории родителя, чистый bundle roundtrip, повторный импорт, вложенные цели словаря, bridge form-drill и сохранение упражнения при refresh — pass на обеих поверхностях. Provider endpoints блокировались; `paid=0`, `errors=[]`: [лог](selected-targets.jsonl), [форма в Зале](room-form-380.png), [Студия RTL](studio-he.png). Эти изменяемые учебные данные находятся только в тестовых профилях.
- Вкладка владельца через Kapture: загружены реальные scripts `?v=804`, карточка строки 22 показывает `pid:1612`, статус l4 и новую кнопку формы. Кнопки статуса/включения/оценки владельца не нажимались. `review_log` до и после: **11748**, одинаковый SHA-256 **73d3fcae17a0bf6d9268f7e6e011b6ac1a86a91e986b743a44210eda586d683e** (`JSON.stringify(SELECT * FROM review_log ORDER BY id)`). Родительский статус/срок/интервал/reps/lapses сохранились: [ограниченный read-only результат](owner-readonly.json).

## Согласованная очистка

В этой сессии владелец отдельно разрешил три точных образа и неиспользуемый build cache до/после сборки. Непосредственно перед удалением проверены нулевые container references. Удалены только `fd1d77c6a2e6` (a5955da4), `2adb97690b5a` (32204e7c), `e6f072e13bd9` (030f2437). До сборки prune сообщил 2.69GB, после — 2.691GB (эти значения Docker включают shared layers, их нельзя складывать как фактически освобождённые байты).

`df`: 1.7G / 96% → 7.3G / 80% до сборки → 4.0G / 89% после сборки → **6.0G / 84%** после финального prune. Build cache 0B. Новый current `4b951c98d3b8`, прежний current `2e7b10aede96` (803) и прежний rollback `c0fdf3940c48` (800) присутствуют. Остальные 10 исходных контейнеров с теми же ID работают; приложение заменено штатным rollout, всего 11 running. Четыре исходных volumes сохранены. БД, backups, containers и volumes отдельной очистке не подвергались.

## Воспроизведение

Из корня проекта (scripts используют опубликованные production assets, локальные одноразовые browser profiles и не запускают remote writes в learner cloud):

```powershell
node docs/research/morphology-learning-targets/2026-10-21/production/verify-assets.cjs
$env:EXPECT_VERSION='3.11.804'
node docs/research/morphology-learning-targets/2026-10-21/production/public-work.cjs
node docs/research/morphology-learning-targets/2026-10-21/production/selected-targets.cjs
```

`selected-targets.cjs` — копия проверенного browser gate с production BASE и отключённым локальным сервером; только синтетический corpus response перехватывается для fixture. Результаты повторного запуска пишутся в `.tmp`, исторические файлы этого каталога не перезаписываются. Проверка owner-профиля здесь не автоматизирована и не выполняет тестовых записей.
