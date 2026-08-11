# B5 evidence — continuity и release hardening

Дата среза: 2026-08-11

Версия: `3.11.359`

Статус: локальные автоматизированные и визуальные гейты пройдены. Production-проверка выполняется отдельно после allowlist commit/push/deploy. Физический owner-live smoke на iPhone не выполнен и не подменяется Playwright-автоматизацией; до него B5 не является основанием для заявления `premium GA`.

## Цель и граница

B5 замыкает учебный цикл `Learning Home / корпус → Reader → тот же контекст или следующий учебный шаг`. Он не создаёт новый learner store, не копирует progress, не меняет канонические writer-контракты LocalDb/FSRS/Studio/Trainer и не вводит отдельный recommendation engine.

Контекст возврата существует только в памяти текущей страницы и содержит:

- положение corpus drill (`hub / Ben‑Yehuda / My Texts / group`, уровень, период, автор);
- текущий scroll и визуальную позицию открытой строки;
- стабильную presentation-only identity строки и её primary action;
- открытое/закрытое состояние filter disclosure.

После закрытия Reader прогресс сначала flush-ится в существующий LocalDb, затем активный corpus adapter заново строит DOM из канонического состояния. Поиск, facet/smart filters и sort остаются в уже существующих view-state объектах; после repaint восстанавливаются точная строка, фокус и её визуальный якорь. My Texts намеренно может переставить только что открытый текст при сортировке по `last_opened_at`: возвращается сам текст в прежнее место viewport, а не устаревшая абсолютная координата страницы.

## Контур завершения

End-of-text сохраняет независимые честные действия:

- `✓ Прочитано` остаётся явным asserted-действием и не выполняется автоматически;
- `Повторить слова` открывает существующий in-text recall;
- существующий handoff предлагает следующий/более сложный/cold-start текст без нового рекомендателя;
- `На главную` выполняет обычный progress flush и открывает Learning Home, не выставляя `finished_at`.

После `На главную` Learning Home строится заново. В fixture-проверке незавершённая учебная песня честно стала главным `Продолжить` с реальным прогрессом `67%`, но осталась `finished=false`.

## Найденные и устранённые дефекты

1. Reader всегда делал `scrollTo(0,0)` и не сохранял origin focus. Возврат терял место даже при неизменном списке.
2. После Back обновлялся только нефильтрованный home Ben‑Yehuda; My Texts, group corpus и filtered/search results оставались со stale progress/state DOM.
3. Полноразмерные Ben‑Yehuda result rows не резервировали слот lazy Learning Compass. При возврате readiness нескольких строк над якорем достраивался и сдвигал выбранную работу на `116px`. Добавлен eager empty slot; данные по-прежнему lazy и derived.
4. Served-on-open показывает loading до завершения импорта. Ранний keyboard Back закрывал Reader, но поздний import completion снова вызывал `openReader()` без нового действия пользователя. Единый `readerOpenEpoch` теперь отзывает только UI-authority запоздавшего результата; безопасно завершившийся OPFS import не отменяется и не становится вторым writer.
5. Каталог становился видимым до окончания асинхронного repaint, поэтому очень быстрый следующий тап мог попасть в старую карточку. Возврат теперь атомарный: Reader остаётся единственной видимой поверхностью, Back временно disabled, скрытый каталог обновляется и затем показывается одним swap.
6. На `320px` русские названия трёх вкладок создавали общий horizontal overflow `43px`. Узкий breakpoint получил shrinkable tabs, компактный spacing и локальный ellipsis; повторная матрица показывает `0px` overflow.
7. Footer Reading Room показывал устаревший `v3.11.65`, хотя document/SW уже были на `3.11.358`. B5 синхронизировал Studio document, Room footer и SW на `3.11.359` и добавил постоянный unit-gate равенства.
8. Параллельный запуск legacy browser smokes выявил не продуктовый конфликт fixture-server. Release run выполнен последовательно; зелёные результаты ниже относятся к изолированным запускам.

## Continuity и performance evidence

Источник: `continuity.json`, воспроизводится `scripts/premium/room-continuity-browser-smoke.js`.

| Проверка | Результат |
|---|---:|
| Continuity / keyboard / finish / reduced motion | `34/34` |
| My Texts focus + visual anchor | exact (`376.6px → 376.6px`) |
| Ben‑Yehuda focus + visual anchor | exact после CLS-fix |
| Study Songs focus + visual anchor | exact |
| Query/facet state после Reader | preserved |
| Finish Home silently sets `finished_at` | no |
| Infinite animation при reduced motion | `0` |
| Page errors / HTTP 5xx | `0 / 0` |
| Cold / cached navigation | `165.7ms / 95.3ms` |
| Cold / cached LCP | `859.4ms / 271.2ms` |
| Cold / cached Learning Home interaction | `62.5ms / 49.9ms` |
| Main-thread tasks `>50ms` | `0 / 0` |

Cold/cached — два последовательных navigation-run в одном чистом Chromium context с заблокированным Service Worker, чтобы отдельно измерить browser/HTTP-cache repeat. Это локальный deterministic release gate, не замена production RUM.

## Responsive / locale / theme matrix

Источник: `matrix/metrics.json`; browser gate `838/838`.

| Viewport | Locale / direction | Theme | Поверхности | Max row | Overflow | In-scope AA failures |
|---:|---|---|---:|---:|---:|---:|
| 320 | RU / LTR | dark | 4 | 91px | 0px | 0 |
| 360 | HE / RTL | light | 4 | 91px | 0px | 0 |
| 380 | RU / LTR | light | 4 | 91px | 0px | 0 |
| 380 | HE / RTL | dark | 4 | 91px | 0px | 0 |
| 430 | RU / LTR | dark | 4 | 91px | 0px | 0 |
| 510 | HE / RTL | light | 4 | 91px | 0px | 0 |
| 1280 | RU / LTR | light | 4 | 88px | 0px | 0 |
| 1280 | HE / RTL | dark | 4 | 88px | 0px | 0 |

Во всех 32 surface captures: не более 48 browse rows, максимум 12 Ben‑Yehuda ready-preview rows, DOM максимум 1183 элемента, 0 nested interactive, 0 видимых targets ниже 24px, 0 unlabeled form controls, 0 cosmetic `0%`, максимум один readiness-сигнал на строку. Mobile filters стартуют компактно и явно раскрываются; desktop filters раскрыты; management следует после учебного контента.

## Визуальные артефакты

- `mytexts-return-380-ru.png`, `benyehuda-return-380-ru.png` — каталог после точного возврата;
- `finish-home-380-ru.png` — честный Learning Home после end-of-text Home;
- `matrix/<viewport>-<locale>-<theme>-{hub,benyehuda,mytexts,study-songs}.png`;
- `matrix/*-rows.png` — строка принудительно помещена в viewport и проверена до capture;
- `matrix/*-filters.png` — mobile drawer с реальным активным условием.

Seeded screenshots показывают product shape и поведение на чистом fixture-profile. Они не содержат и не доказывают состояние реального владельца.

## Полный локальный regression belt

- `node --test tests/roomUxMaturity.test.js` — `16/16`;
- `node scripts/premium/room-continuity-browser-smoke.js --out=.../b5-evidence` — `34/34`;
- `node scripts/premium/room-ux-maturity-browser-smoke.js --stage=B5 --out=.../b5-evidence/matrix` — `838/838`;
- group corpus UI — PASS `@380/@510/@1280`;
- My Texts — PASS;
- corpus navigation — `33/33`;
- Room media — PASS;
- Room study — PASS;
- Reader notes — PASS;
- Reader resume — `45/45`;
- Studio→Room SRS — `49/49`;
- Reader parity — PASS;
- Bookmarks — `11/11`;
- legacy Room — `14/14`;
- Room mode — `25/25`;
- i18n — `233/233`, locale lock `149`;
- canon version — `18/18`;
- memory canon — `79/79`.

Node unit-import печатает harmless `MODULE_TYPELESS_PACKAGE_JSON` warning: browser ESM presenter импортируется из CommonJS test runner. Перевод всего toolchain в `type: module` не входит в B5 и не нужен runtime.

## Оставшийся owner-live gate

После production exact-version и clean-profile проверки владелец должен на физическом iPhone пройти: открыть Learning Home, выбрать текст из каждого доступного корпуса, вернуться Back, проверить сохранение фильтра/позиции/focus-equivalent, дойти до конца короткого текста, выбрать `На главную`, сменить RU↔HE/RTL и light↔dark, повторить при плохой сети/после reload. До этого результат честно называется production automation + owner-live pending, а не iPhone acceptance или GA.
