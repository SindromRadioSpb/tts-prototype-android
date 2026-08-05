# Студия: «Статус слов» + морфологическая карточка на тапе (паритет с Залом)

**Дата:** 2026-08-05 · **Статус:** OWNER-APPROVED (полный паритет, подход A, удаление мобильного шита)
**Поверхность:** Studio (`public/index.html`) · **Образец:** Читальный зал (`public/library.html` + `public/js/library-ui.js`)

## Цель

Перенести в Студию два инструмента Зала, работающих СРАЗУ после формирования таблицы (без сохранения карточки текста в библиотеку):

1. **«Статус слов»** — включаемая раскраска слов таблицы по учебному статусу (новое / l1–l4 / знаю / игнор) из глобального профиля `word_status`.
2. **Морфологическая карточка на тап** — тап по слову в колонках Иврит/Огласовки открывает ту же карточку ReaderMorph (статус, заметка, корень/семья, спряжение/склонение, Pealim, 🔊, наставник, точный режим Dicta, due-кольца + режим «вспомни»).

Мобильный шит «Строка таблицы» (`classicRowSheet`) — устаревший функционал — **удаляется целиком**; его действия («Озвучить строку», «Заметка») остаются в служебной колонке.

## Не-цели (v1)

- Счётчики «В работе / К повторению» и кнопка «Учить новые слова» в Студии — не переносятся.
- Адаптивное затухание огласовок — не переносится (`fadeMode: 'full'`).
- Никаких изменений табличного билдера (`renderTable` заморожен гейтом `smoke:reader-parity`) — только post-render DOM-трансформация (паттерн Зала).
- Никаких новых хранилищ/миграций БД.

## Ключевые факты разведки (проверены по живому коду)

- Студийная таблица уже даёт нужный DOM: `#proTable`, `td[data-col="he"|"niqqud"]`, `tr[data-row-idx]`; канонические строки — `currentTableData` (`{he, he_niqqud, translit, translit_ru, ru, _v3_textId?, _v3_sentenceId?}`).
- В index.html уже загружены: `reader-morph.js`, `lemma-canon.js`, `fsrs-core.js`, `notes-autogen.js`, `inflection-dict.js`. Отсутствуют: CSS `.rm-*` (инлайн в library.html), `reader-dicta.js`, хост-обвязка.
- `word_status` глобален по лемме (OPFS, общий обеим поверхностям). Раскраска — чтение; «новое» = слова нет в профиле, записей не создаёт.
- Контракт хоста ReaderMorph (`attach(mount, opts)`): `getRow, getWordStates, getWordStatus, setWordStatus, speakWord, explainWord, contextProvider, refineContext, canRefine, grantContextConsent, lookupNote, loadWordNote, saveWord, saveWordPersonal, lookupUserMeaning, saveUserMeaning, getDueSchedule, noteRecallShown, gradeReadingTap`.
- Ловушка: `studio-karaoke.js` (подсветка слов при озвучке строки) строит СВОИ `.rm-w`-спаны и на stop() восстанавливает исходный innerHTML — затёр бы морф-спаны/краску.
- Ловушка: режим правки (`tbl-edit-mode`) — тапы по ячейкам редактируют; карточка там не должна открываться.

## Архитектура (подход A — общий хост-модуль, форк запрещён)

### Новый общий модуль `public/js/morph-host.js`

По прецеденту `media-host.js`: ОДНА реализация семантики памяти слова на обеих поверхностях. Переезжают из `library-ui.js` (тела сохраняются, Room делегирует):

- `markWordStatus(env, lemmaKey, status, source)` — метка + FSRS-посев (oracle-clean: seed-row → replay==stored), R1 source-at-mark.
- `gradeReadingTap(env, card, occ, correct, prev)` — канонический write-step оценки чтения (`review_log` channel `reading:tap`, D8(a): уровень не двигается).
- `occToVerifiedSource(env, occ)` — verified-only источник (env.getTextKey()).
- Фабрика single-flight кэша статусов (`ensureWordStates`/invalidate; ошибка НЕ кэшируется).
- Глю заметок: `lookupNote / loadWordNote / saveWord / saveWordPersonal / lookupUserMeaning / saveUserMeaning` (+ `roomDedupKey`/`roomNoteBody`).
- Consent-хелперы Dicta (`contextConsent`/`contextConsentSet` + диалог согласия; ключи localStorage ОБЩИЕ: `room.contextConsent`) и фабрики `contextProvider`/`refineProvider`.
- Ядро `speakWord` (GCP BYOK → браузерный голос; `env.getTtsKey`).

Параметризация: `env = { localDb, getTextKey(), toast(msg), onProfileChanged(), getTtsKey(), dayStr() }`. Room-специфические побочки (refreshDueBadge, invalidateReadableSet, applyDecorations) уходят в `env.onProfileChanged`/хуки Зала.

### Новый студийный адаптер `public/js/studio-morph.js`

- env-адаптер Студии: `localDb` (тот же OPFS-модуль), `getTextKey` → ключ активного сохранённого текста или null (несохранённый), `toast` → showToast, `getTtsKey` → студийный BYOK GCP-ключ, `onProfileChanged` → инвалидация кэша + перекраска.
- `attach` ОДИН раз к `#tableContainer` (элемент переживает innerHTML-пересборки); после каждого рендера (полного, чанкового, выхода из edit-mode, восстановления из кэша) — идемпотентный `refresh()`: wrapMount (флаг `data-rm-wrapped`) + `decorateWords` (цвет по тумблеру, `fadeMode:'full'`, dueSet по расписанию).
- Тумблер «🎨 Статус слов»: ключ `studio.wordStatus`; при ПЕРВОМ чтении наследует `room.wordStatus`; далее независим.
- Подавление в `tbl-edit-mode`: wrap не выполняется / тапы не открывают карточку.
- `explainWord` → адаптер над studio-agent (существующий агентский путь Студии); при недоступности агента кнопка честно скрыта (контракт ReaderMorph это уже умеет).

### Правки существующих файлов

- **`public/library.html`**: CSS `.rm-*`, `.room-consent`, палитра `--ws-*` выносятся в общий **`public/css/reader-morph.css`** (link в обеих страницах); библиотечный инлайн-блок удаляется. Поведение Зала не меняется.
- **`public/js/library-ui.js`**: делегирование в morph-host (тонкие обёртки с теми же именами); публичный контракт (`window.__r31BackfillZombieSeeds` и пр.) сохраняется.
- **`public/index.html`**: link CSS; script `reader-dicta.js`, `studio-morph.js`; чекбокс «🎨 Статус слов» + легенда в «🎛️ Настройки таблицы»; вызовы `StudioMorph.refresh()` после рендеров; УДАЛЕНИЕ `classicRowSheet` (DOM #classicRowSheet*, CSS .classic-row-sheet*, функции open/close, document-opener, ссылки `rowSheetOpen` в FAB-логике — gate-consumers-sweep); исключение из ловушки `button{width:100%}` для `.rm-sheet`.
- **`public/js/studio-karaoke.js`**: `wrapCell` переиспользует уже обёрнутые морфом спаны (td с `data-rm-wrapped` не пере-оборачивается и не рестор-ится — спаны с `data-w-offset` уже есть; подсветка работает поверх краски).
- **Локали `public/i18n/locales/{ru,en,he}.js`**: новые строки Студии (тумблер/легенда/приписка — reuse room.* ключей, где текст идентичен; новые `studio.*` только при отличии). **SW `CACHE_VERSION` bump** + precache новых файлов.

## Поведение

- **Раскраска**: только уверенно распознанные учебные слова (та же честная логика `decorateWords`; служебные и не найденные — без цвета). Работает на несохранённой таблице сразу после перевода, включая чанк-прогрессию длинных медиа.
- **Тап по слову** (Иврит/Огласовки; desktop + mobile; НЕЗАВИСИМО от тумблера — как в Зале): карточка ReaderMorph. Долгий тап — быстрый статус-поповер. Тап по переводу/транслиту/пустому месту — ничего (шит удалён).
- **Due-петля**: кольца у слов «к повторению» (только при включённом тумблере — как в Зале), тап из-под кольца → режим «вспомни» (reveal → ✓/✗ → `review_log`/FSRS). Оценка и метка byte-семантически идентичны Залу (один код).
- **Несохранённая карточка текста**: краска read-only; ручная метка пишется глобально по лемме (переживает сохранение автоматически); source-at-mark честно `null` (нет verified-предложения в OPFS) — после сохранения лечится штатным R4 heal-drain. Никакого спец-хранилища «на время до сохранения» не создаётся.
- **Karaoke/TTS строки**: подсветка `rm-w-speaking` работает поверх краски; тап по слову играющей строки открывает карточку.
- **Edit-mode**: краска и тапы подавлены; после выхода — refresh.

## Тесты и гейты

- Новый **`smoke:studio-morph`** (Playwright, детерминированный, offline): (1) тумблер красит/гасит; (2) тап → карточка с палитрой; (3) метка → перекраска + строка в `word_status`; (4) несохранённая таблица красится и метится; (5) edit-mode подавлен; (6) шит отсутствует, opener удалён; (7) karaoke-патч не ломает краску (wrap-reuse). 
- Зелёные существующие: `smoke:reader-morph`, `smoke:reader-morph:audit` (spot), `smoke:memory-canon` (канон метки через morph-host), `smoke:reader-parity`, `smoke:room-media`, `smoke:room-study`, `test:api-smoke`, i18n-полнота локалей.
- **Живой браузер** (обязательная фаза): desktop + 380×844; сценарии — несохранённый перевод → тумблер → тап → метка; сохранение → открыть в Зале → цвет совпадает; скриншоты в отчёт.

## Риски

| Риск | Митигция |
|---|---|
| Регресс Зала при выносе глю | Тела функций переезжают без семантических правок; делегаты сохраняют имена; smoke:memory-canon (replay==stored) + smoke:reader-morph до/после |
| Parity-гейт таблицы | Билдер не трогаем; только post-render |
| Караоке-конфликт врапперов | Явный патч wrapCell + сценарий в smoke:studio-morph |
| CSS-каскад index.html (39K строк) | Общий css-файл подключается ПОСЛЕ инлайна; исключение width:auto; скриншот @380 до коммита |
| SW-кеш | CACHE_VERSION bump, precache css/js, cache-bust при проверке |

## Раскатка

Версия v3.11.x bump → гейты → коммит+пуш в main (авто-деплой Coolify) → прод-верификация (`linguistpro.kolosei.com`, cache-bust) → запись в память проекта.
