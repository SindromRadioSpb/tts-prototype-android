# B4 evidence — readiness и нормализованные corpus adapters

Дата среза: 2026-08-11

Версия: `3.11.358`

Статус: локальные автоматизированные гейты пройдены; production-проверка фиксируется отдельно после commit/push/deploy. Это не owner-live проверка на физическом iPhone.

## Цель и граница B4

B4 вводит единый presentation-контракт для scan-line каждого корпуса: идентичность, learner state, readiness, media и provenance. Он не создаёт новую учебную истину, не пишет вычисленные данные обратно в LocalDb и не меняет authority Reader, Trainer, Studio или защищённого группового корпуса.

Нормализованный ViewModel содержит `corpusId`, `itemId`, `textKey`, title/creator/secondary identity, language direction, kind, artwork, `learnerState`, `readiness`, `media`, saved state, tags, actions и provenance. Неизвестное значение остаётся `null`; оно не превращается в `0%`, «начальный уровень» или полное покрытие.

Confidence видим и машинно проверяем:

- `asserted` — значение прямо задано владельцем или в Studio;
- `derived-high` — вычисление опирается на достаточный реальный профиль;
- `derived-soft` — ориентир приблизительный и визуально отмечен пунктирной рамкой.

В scan-line допускается не более двух readiness-сигналов. Подробное объяснение и происхождение доступны через `ⓘ`, но не конкурируют с основным действием чтения.

## Адаптеры по корпусам

### Библиотека Бен‑Иегуды

- Сложность берётся только из существующего vocab-sidecar и остаётся derived, а не заявленным уровнем.
- Процент знакомых слов появляется только при фактическом overlap с пользовательским словарём; отсутствие overlap остаётся `null`, а не `0%`.
- Continue использует существующую карту LocalDb progress и реальный denominator строк.
- Readiness считается лениво через существующий `IntersectionObserver`; единственный batched progress-query кешируется на presentation-cycle, без DB fan-out на карточку.
- В компактном ready-preview показывается главный fit-сигнал и объяснение. Редкая оговорка «много имён/архаики» остаётся в provenance-панели, чтобы не обрезать основной уровень на 380px.

### Мои тексты

- Уровень показывается только если он asserted в Studio.
- Continue сохраняет честную позицию строки; процент не вычисляется при отсутствии валидного denominator.
- Приписанный сырому объекту `familiarityPct` намеренно игнорируется: подтверждённого анализа для личных текстов пока нет.
- Медиа определяется по существующему MediaHost passport. Наличие аудио с неизвестной полнотой читается как «Аудио», а не ошибочное «Без аудио».
- Dicta Nakdan и provenance сохранены во вторичном per-row раскрытии; consent и защита asserted niqqud не изменены.

### Учебные песни / групповой корпус

- Позиция назначения, исполнитель и asserted level сохраняются.
- Audio coverage выводится строго как `N/N`: full, partial или none по фактическим `audio_count/rows_count`.
- TTS и `audio_revision` находятся в provenance detail, а не маскируются как человеческая запись.
- Continue использует только существующий personal progress участника. Familiarity не показывается без отдельного валидированного контракта.
- Поиск, taxonomy, smart-фильтры, share и owner/member access не заменены общим адаптером и продолжают использовать свои authoritative операции.

## Измеримая матрица

Источник: `metrics.json`. `Compass` — нормализованные строки, `visible fit` — реально видимые, не обрезанные readiness-сигналы.

| Viewport / locale | Corpus | Max row | Compass | visible fit | Max readiness | Contrast | Overflow |
|---|---|---:|---:|---:|---:|---:|---:|
| 380 RU light | Ben‑Yehuda | 87 px | 9 lazy | 9 | 1 | 0 | 0 px |
| 380 RU light | My Texts | 91 px | 48 | 48 | 1 | 0 | 0 px |
| 380 RU light | Study Songs | 88 px | 48 | 48 | 1 | 0 | 0 px |
| 380 HE/RTL dark | Ben‑Yehuda | 87 px | 1 lazy | 1 | 1 | 0 | 0 px |
| 380 HE/RTL dark | My Texts | 91 px | 8 | 8 | 1 | 0 | 0 px |
| 380 HE/RTL dark | Study Songs | 88 px | 48 | 48 | 1 | 0 | 0 px |
| 1280 RU light | Ben‑Yehuda | 87 px | 3 lazy | 3 | 1 | 0 | 0 px |
| 1280 RU light | My Texts | 85 px | 48 | 48 | 1 | 0 | 0 px |
| 1280 RU light | Study Songs | 88 px | 48 | 48 | 1 | 0 | 0 px |

Во всей матрице: 0 cosmetic `0%`, 0 unsupported familiarity в My Texts/Study Songs, exact `N/N` у всех 48 видимых песен, TTS revision у всех 48 provenance-панелей, 0 nested interactive, 0 target ниже 24px, 0 unlabeled visible form controls, 0 in-scope AA contrast failures, 0 horizontal overflow и 0 page errors.

## Визуальные доказательства

- `380-ru-light-{hub,benyehuda,mytexts,study-songs}.png`;
- `380-he-dark-{hub,benyehuda,mytexts,study-songs}.png`;
- `1280-ru-light-{hub,benyehuda,mytexts,study-songs}.png`;
- `*-rows.png` — viewport захватывается только после подтверждения, что строка действительно находится в кадре;
- `380-*-{benyehuda,mytexts,study-songs}-filters.png` — явное открытие drawer и активное условие.

## Red → green и найденные дефекты

1. Два B4 unit-red теста сначала падали из-за отсутствующего pure presenter; после добавления адаптеров — 11/11.
2. Первый browser-run выявил пять нарушений: высоту групповых строк и недостаточный dark contrast partial/full audio. После уплотнения строки и корректировки dark tokens расширенный gate прошёл.
3. Старый group smoke искал удалённый декоративный `.group-progress-fill`. Его контракт обновлён на нормализованный `50%` learner state, exact `20/34` audio и TTS revision; PASS @380/@510/@1280.
4. Первоначальный screenshot-procedure мог снять пустой viewport после длинного lazy-list scroll. Gate теперь центрирует строку и проверяет её geometry/visibility до снимка.
5. Визуальная проверка нашла обрезанную caveat-chip в узкой строке Бен‑Иегуды. Caveat сохранена в detail, а scan-line очищен до главного уровня.
6. Room media smoke обнаружил, что новая типизация сначала могла назвать passported audio с неизвестной полнотой «Без аудио». Добавлено отдельное состояние «Аудио»; весь media/karaoke flow повторно прошёл.

## Пройденные гейты

- `node --test tests/roomUxMaturity.test.js` — 11/11;
- `node scripts/premium/room-ux-maturity-browser-smoke.js --stage=B4 --out=.../b4-evidence` — 312/312;
- `node scripts/premium/group-corpus-ui-smoke.js` — PASS @380/@510/@1280;
- `node scripts/premium/mytexts-smoke.js` — PASS;
- `node scripts/premium/corpus-nav-smoke.js` — 33/33;
- `node scripts/premium/room-media-smoke.js` — PASS;
- `node scripts/premium/room-study-smoke.js` — PASS;
- `node scripts/premium/reader-notes-smoke.js` — PASS;
- `node scripts/premium/studio-room-srs-smoke.js` — 49/49;
- `npm run smoke:reader-parity` — PASS;
- `npm run smoke:bookmarks` — 11/11;
- `npm run smoke:i18n` — 233/233, locale lock `148`;
- `npm run smoke:canon-version` — 18/18;
- `npm run smoke:memory-canon` — 79/79.

Node unit-import печатает harmless `MODULE_TYPELESS_PACKAGE_JSON` warning, потому что browser ESM-модуль импортируется из CommonJS test runner. `package.json` сознательно не переведён в `type: module`: это затронуло бы весь CommonJS toolchain и не является необходимым для runtime.

## Граница B5

B4 не меняет continuity между Learning Home, Reader и возвратом из чтения, не добавляет новый resume handshake и не объявляет owner-live качество. B5 должен закрепить сохранение corpus/scroll/filter context при чтении и возврате, focus/keyboard/reduced-motion/slow-path hardening, полную release-матрицу и production evidence без нового learner truth.
