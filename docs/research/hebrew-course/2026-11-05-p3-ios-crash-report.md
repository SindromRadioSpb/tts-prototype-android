# P3 iOS crash: измерение и исправление canvas allocation churn

Дата: 2026-11-05. Ветка: `fix/world-canvas-ios`, от `origin/main` **93c9b96d9deb4159c6bc567083298fab0dbdccc2** (production source 3.11.855). Задание: [P3-F2](2026-11-05-p3-ios-crash.md).

## Вывод и статус

**Подтверждён и исправлен лишний allocation churn общего движка. Причина физического падения вкладки пока не доказана.** Playwright WebKit не воспроизвёл падение. Исходная гипотеза «высота документа × DPR 3 → холст >7M» для текущего мира Memorial опровергнута замером: canvas всегда 2048×683 = 1 398 784 px; высота документа меняется, canvas — нет. Десять переходов не вызывают новых `resize` или присваиваний размеров ни до, ни после исправления.

Отдельный контролируемый стимул выявил реальный дефект: **10 одинаковых window resize-events → 40 лишних присваиваний canvas размеров до исправления; после → 0.** Это релевантная защита при viewport/observer событиях, но её нельзя выдавать за доказанную причину iOS jetsam. Отчёт владельца о двух падениях остаётся действительным; O-143 открыт до проверки на устройстве.

**В production ничего не выпускалось, main не менялся, удалений пользовательских файлов и cleanup на сервере не было.** Патч и отчёт опубликованы только в указанной рабочей ветке; она ещё не часть main. Выпуск требует нового «да» владельца. Перед будущим выпуском отдельно обновить release/cache versions и проверить место на production ≥6 GiB; затем owner повторяет сценарий на физическом iPhone.

## Метод и границы

- Локальный неизменённый production source baseline, затем тот же стенд с патчем. Playwright WebKit, `devices['iPhone 15']`: viewport393×659, screen393×852, DPR3; Windows WebKit не физическая iOS.
- Настоящий изолированный server/database и owner bootstrap-login; fixture `tests/fixtures/course/mini`, id `ulpan`. Настоящие Course UI/API и world engine. Платные/внешние запросы блокируются. Mini-fixture проверяет переходы и разную длину шагов; это не полный production learner profile.
- `?canon=skip` — существующий opt-out unrelated cold canon import. Без него WebKit задержался на «Готовим библиотеку…». WebKit использовал штатный DB fallback (OPFS `navigator.storage.getDirectory` отсутствует); это отдельная граница стенда.
- Вход через настоящий corpus picker, затем «Кафе». `evaluate(n => n.click())` для кнопок исключает известный O-142 pointer interception из этого измерения. Это не touch/scroll/address-bar acceptance. Десять переходов: Дальше/Назад, пять циклов между первыми двумя шагами, 250 ms между ними.
- Перехвачены setters `HTMLCanvasElement.width/height` (включая off-DOM sky) и `createRenderer().resize`, включая adapter wrapper. Счётчик `resizeCalls` считает **adapter и inner отдельно**; Memorial один вызов engine обычно даёт два события. Он накопительный с загрузки, включая исходный default World до Classic и явный remount выбранного мира. Поэтому абсолютное начальное значение не равно количеству переходов.
- Нет измерения resident memory/GPU memory или iOS jetsam logs. Сумма `width×height` после setters — объём backing-store writes, **не peak/retained memory**. Нельзя складывать его как одновременно занятые мегабайты.
- Изолированные серверы скрыты и завершены. При одной визуальной пересъёмке Windows WebKit завис на close после записи всех PNG: завершены только собственные node/server, добавлено ограниченное ожидание cleanup и сохранение результатов до close.

Воспроизведение: `node scripts/world-canvas-ios-smoke.cjs before` и `node scripts/world-canvas-ios-smoke.cjs after`. `before` подаёт точные четыре исходных runtime JS через same-origin interception из `git show 93c9b96d:<path>`; остальной стенд общий. `--visual-only` переснимает шесть миров после `__roomSettled` и `scrollTo(0,0)`, сохраняя таблицу курса. Первые baseline-замеры выполнены **до runtime-правок**, не восстановлены задним числом. Машинные данные: [before](2026-11-05-ios-canvas/before/measurements.json), [after](2026-11-05-ios-canvas/after/measurements.json).

## 10 переходов: Мир / Classic

Во всех строках пары означают **Мир / Classic**. Размер, площадь, число canvas одинаковы до и после. Высота документа после также совпала.

| Переход | Высота документа px | Canvas width×height | Площадь px | Canvas в DOM | Resize до | Resize после |
|---:|---:|---|---:|---:|---:|---:|
| 0 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 1 | 1431 / 1175 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 2 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 3 | 1431 / 1175 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 4 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 5 | 1431 / 1175 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 6 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 7 | 1431 / 1175 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 8 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 9 | 1431 / 1175 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |
| 10 | 2304 / 2048 | 2048×683 / — | 1 398 784 / 0 | 1 / 0 | 10 / 6 | 6 / 4 |

Нет прироста canvas, resize или allocation setters на любом из этих переходов. В обоих режимах pageerrors=0; автоматического падения не было.

## Контролируемый resize и длинный документ

После сценария добавлен блок высотой 10 000 px: документ Мир12304 / Classic12048 px. Уже **до исправления** Memorial не растёт. Затем 10 `window.dispatchEvent(new Event('resize'))` с интервалом50ms без изменения реальной геометрии:

| Метрика Мир | До | После |
|---|---:|---:|
| Canvas size / count | 2048×683 / 1 | 2048×683 / 1 |
| `resizeCalls` начало→конец | 10→30 | 6→6 |
| Все dimension setters, с off-DOM | 18→58 | 16→16 |
| Прирост backing-store write area | 45 035 520 px | 0 |
| Эквивалент операций при4bytes/px (не RAM) | ~171.8 MiB | 0 |

Classic: ни до, ни после прироста нет. В raw audit видно, что прежний generic `resize` безусловно заново назначает canvas width/height, сбрасывает skyKey, затем `drawSky` создаёт новый off-DOM canvas. Memorial каждый раз передаёт inner фиксированные2048×683. Именно эта цепочка, а не размер документа, подтверждена контролируемым замером.

## Исправление

- `world-engine.js`: сцена ограничена viewport по высоте; короткая полоса шапки сохраняется. Геометрия header/viewport отдельно от высоты document. Одинаковый `(width,height,scale)` не передаётся renderer повторно; ResizeObserver/window resize объединены в один animation-frame, pending callback отменяется при unmount.
- `world-render.js`: идемпотентный resize, максимум4 000 000px, плотность generic renderer не выше2. Существующий pixel-art `scale` означает CSS px на логический пиксель, DPR не умножает размеры; дополнительного DPR-upscaling не добавлено. Старый canvas/sky освобождается нулевыми размерами перед заменой; destroy освобождает также tint cache.
- `memorial-adapter.js`: fade-canvas освобождается перед удалением. Фиксированная **логическая** композиция2048×683 остаётся: это не devicePixelRatio; её CSS density на мобильном выше2, но площадь1.4M. Принудительная смена логических координат/детальности Memorial не входит в доказанный дефект. Generic idempotence убирает повторную allocation этого буфера.
- `ulpan-world.js`: неизменный логический1280×456 не reallocates на каждом вызове; destroy освобождает буфер. Фиксированные adapter buffers уже меньше4M.
- Курс, ответы, learner data и API не менялись. Release/version URLs пока прежние: это **не выпущенный патч**, обязательный release bump остаётся перед разрешённым деплоем.

## Проверки

1. До runtime-изменений новые `tests/worldCanvasMemory.test.cjs` — **6/6 FAIL** по ожидаемым причинам: repeated width/height assignments, старый sky не обнулён, allocation>4M, отсутствие bounded geometry/gate/coalescing helpers.
2. После: **6/6 PASS**. Длинный10000px input, bound/density, same-size без перераспределения и sky recreation, release/destroy, viewport geometry, gate, coalescing/cancel.
3. Все существующие world suites + новые: **36/36 PASS** (`worldEngine`, `worldSignLayout`, `memorialWorld`, `sukkotWorld`, `ulpanWorld`, `worldCanvasMemory`).
4. `npm test`: **3234 tests,3232pass,2skip,0fail**.
5. Повторный WebKit сценарий и resize stress: **PASS**, данные выше. Дальнейший физический iPhone test не заменён эмуляцией.

## Визуальная регрессия

WebKit,390 и1440px, высота900; мир paused, day. Перед screenshot ожидается Room settled, scrollY=0; canvas rect и debugState сохранены в JSON. До — source93c9b96d, после — патч. Шесть пар:

| Мир | 390 | 1440 |
|---|---|---|
| Выборы | [до](2026-11-05-ios-canvas/before/israel-elections-2026-390.png) · [после](2026-11-05-ios-canvas/after/israel-elections-2026-390.png) | [до](2026-11-05-ios-canvas/before/israel-elections-2026-1440.png) · [после](2026-11-05-ios-canvas/after/israel-elections-2026-1440.png) |
| Суккот | [до](2026-11-05-ios-canvas/before/sukkot-390.png) · [после](2026-11-05-ios-canvas/after/sukkot-390.png) | [до](2026-11-05-ios-canvas/before/sukkot-1440.png) · [после](2026-11-05-ios-canvas/after/sukkot-1440.png) |
| Ульпан | [до](2026-11-05-ios-canvas/before/ulpan-journey-390.png) · [после](2026-11-05-ios-canvas/after/ulpan-journey-390.png) | [до](2026-11-05-ios-canvas/before/ulpan-journey-1440.png) · [после](2026-11-05-ios-canvas/after/ulpan-journey-1440.png) |

Финальные шесть пар просмотрены: шапка, сцены, персонажи, таблички и controls не изменились. Canvas dimensions/rect и scrollY совпадают во всех шести парах. Pixel comparison: область мира/шапки идентична; различия 3–612 pixels находятся только в узкой вертикальной линии карточки ниже мира (1.3–3.2M pixels на снимок), Ulpan1440 полностью идентичен. [Числа и bounding boxes](2026-11-05-ios-canvas/visual-comparison.json).

## Выпуск 3.11.856 — разрешён владельцем 2026-11-05

Владелец: «выпусти на прод я протестирую». Предыдущие формулировки «не выпускалось» выше описывают состояние диагностического этапа до этого разрешения.

- Выпущен runtime **6e4e336ad24a4898f3750194cd81c6ef1cb78936**, версия **3.11.856**, Coolify deployment **3007 finished**. Feature влита fast-forward в main; release/cache version, footer, loader/precache/server integrity URLs обновлены согласованно.
- Полный тест релизного коммита в чистом worktree: **3234 total / 3232 pass / 0 fail / 2 skipped**. Первый прогон в основном checkout обнаружил пропущенный server integrity bump (исправлен) и unrelated gitignored local corpus context payload (данные не менялись; финальный прогон выполнен в чистом checkout).
- Перед runtime push available 5.46 GiB, build cache пуст, активных сборок нет. В рамках существующего разрешения удалён только старый образ `sha256:3f1fe1518e4ae96933656fcd7adc51ca59b8162bd669f54bce0c61f0759cce6a` после проверки отсутствия любых container references. Текущий 855 и предыдущий rollback сохранены. Перед сборкой available **6.90 GiB**, выше gate 6 GiB.
- После finished очищен только неиспользуемый build cache (Docker reported 3.117 GB). Available **5.43 GiB**; active 856 и rollback 855 сохранены, все четыре volumes и runtime containers сохранены. `disk_warn=true` остаётся; перед следующим runtime push снова необходим gate ≥6 GiB. Локальные данные и backups не удалялись.
- Production трижды подряд `/healthz`: ok=true, db.ready=true, migrations.ready=true. Версия API/footer **3.11.856**. SHA-256 девяти опубликованных файлов (SW, три HTML, пять JS) совпали с точными git blob релизного HEAD. Сравнение с Windows working-tree bytes первоначально отличалось из-за line endings; окончательное сравнение использует git blob.
- Живой анонимный Playwright WebKit iPhone15: Memorial, Sukkot, Ulpan, Elections открываются; для каждого 10 одинаковых resize-events дают **0 новых canvas dimension assignments**, area ≤4M, pageerrors=0. Service workers в этом изолированном browser smoke отключены; offline/PWA update не заявляется проверенным. [JSON и результаты](2026-11-05-ios-canvas/production/verification.json), скриншоты рядом.
- Скрипт проверки сохранён как [production-verify.cjs](2026-11-05-ios-canvas/production/production-verify.cjs); запуск из корня репозитория с установленным Playwright WebKit.
- Owner course/ответы в production автоматикой не изменялись. Физическое падение на iPhone пока **не закрыто**; O-143 остаётся в работе до retest владельцем. Повторить «Кафе» в режиме мира, несколько циклов Дальше/Назад, проверить отсутствие перезагрузки вкладки и сохранность ответов. Перед тестом убедиться в версии 3.11.856 внизу страницы.
