# B3 evidence — единый corpus shell и progressive disclosure

Дата среза: 2026-08-11

Версия: `3.11.357`

Статус: локальные автоматизированные гейты пройдены; production-проверка фиксируется отдельно после commit/push/deploy. Это не owner-live проверка на физическом iPhone.

## Цель и граница B3

B3 нормализует представление авторизованных корпусов, не создавая второй источник учебной истины и не подменяя запланированную для B4 модель readiness. В каждом корпусе порядок один:

1. возврат в Learning Home и единый переключатель всех доступных корпусов;
2. идентичность, фактический объём и маркер authority/privacy;
3. один следующий учебный шаг;
4. поиск, фильтры и сортировка;
5. компактный browse;
6. управление и provenance во вторичном раскрытии после учебного содержания.

Динамические групповые корпуса добавляются только в presentation-options из membership-filtered `groupCorpora`. Статический `CORPORA`, LocalDb, прогресс Reader/Trainer, права группы и операции импорта/экспорта не получили нового writer или параллельного реестра.

## Что изменено

### Общий shell

- `corpusSwitcherBar` показывает Бен‑Иегуду, «Мои тексты» и каждый реально авторизованный групповой корпус.
- Один `corpusShellHeader` задаёт общую типографику title/description/count, authority и короткое раскрытие «Что доступно здесь» вместо облака capability-badges.
- Один `corpusNextAction` выводит честный `Continue`, когда сохранённый progress существует, иначе `Start`; отсутствующий процент или readiness не превращается в косметический ноль.
- При переходе из нижней части Learning Home scroll сбрасывается к началу нового корпуса. До исправления новый corpus shell мог открыться вне viewport на старой координате страницы.

### Browse и фильтры

- На 380px поиск остаётся видимым; строка `Фильтры · N` и сортировка занимают одну компактную зону. Drawer закрыт по умолчанию.
- При включённом условии число и активные chips остаются видимыми вне drawer; тест открывает drawer, включает реальный фильтр и проверяет обе индикации.
- На desktop та же DOM/ARIA-структура раскрыта в компактную filter bar; отдельная results-only сортировка Бен‑Иегуды удалена как дубль.
- Восемь personal smart-фильтров, native taxonomy и search scope сохранены, но больше не занимают первый мобильный экран.

### Управление

- Owner tools группового корпуса — участники, приглашения, JSON/ZIP export/import — сохранены за одним `Управление корпусом` disclosure после списка.
- Member видит только своё раскрытие доступа; owner-only controls по-прежнему отсутствуют.
- Добавление и управление личными текстами сгруппированы в одном Studio disclosure после browse.
- Dicta Nakdan сохранён на каждой личной строке, но перенесён в per-row `Другие действия`; consent и asserted/derived protection не изменены.
- У Бен‑Иегуды provenance вынесен в нижнее `О корпусе и данных`, где явно сказано, что перевод, никуд, аудио и сложность показываются только при наличии данных.

## Измеримая матрица

Источник: `metrics.json`; `next Y` — начало следующего учебного шага, а не далёкой последующей shelf-row.

| Viewport / locale | Corpus | Row height | next Y | Initial DOM | Overflow | Group in switcher | Filters |
|---|---|---:|---:|---:|---:|---|---|
| 380 RU light | Ben‑Yehuda | 84–85 px | 433 | 796 | 0 px | да | закрыты |
| 380 RU light | My Texts | 84 px | 358 | 906 | 0 px | да | закрыты |
| 380 RU light | Study Songs | 96 px | 375 | 1103 | 0 px | да | закрыты |
| 380 HE/RTL dark | Ben‑Yehuda | 84–87 px | 358 | 749 | 0 px | да | закрыты |
| 380 HE/RTL dark | My Texts | 84 px | 358 | 424 | 0 px | да | закрыты |
| 380 HE/RTL dark | Study Songs | 101 px | 358 | 1103 | 0 px | да | закрыты |
| 1280 RU light | Ben‑Yehuda | 84–87 px | 325 | 808 | 0 px | да | раскрыты |
| 1280 RU light | My Texts | 84 px | 325 | 906 | 0 px | да | раскрыты |
| 1280 RU light | Study Songs | 88 px | 325 | 1103 | 0 px | да | раскрыты |

Во всей матрице: 0 nested interactive, 0 target ниже 24px, 0 unlabeled visible form controls, 0 in-scope AA contrast failures, 0 horizontal overflow и 0 page errors. Browse ограничен 48 строками для больших локальных/групповых наборов и 12 ready-preview строками Бен‑Иегуды.

## Визуальные доказательства

Для каждого состояния есть начальный экран и scrolled row-capture:

- `380-ru-light-{hub,benyehuda,mytexts,study-songs}.png`;
- `380-he-dark-{hub,benyehuda,mytexts,study-songs}.png`;
- `1280-ru-light-{hub,benyehuda,mytexts,study-songs}.png`;
- `*-rows.png` — плотность и крайние строки;
- `380-*-{benyehuda,mytexts,study-songs}-filters.png` — drawer после явного открытия и включения условия, с `Фильтры · 1` и активным chip.

## Пройденные гейты

- `node --test tests/roomUxMaturity.test.js` — 9/9;
- `node scripts/premium/room-ux-maturity-browser-smoke.js --stage=B3 --out=.../b3-evidence` — 253/253;
- `npm run smoke:reader-mytexts` — PASS;
- `npm run smoke:group-corpus-ui` — PASS @380/@510/@1280;
- `npm run smoke:corpus-nav` — 33/33;
- `npm run smoke:room-media` — PASS;
- `npm run smoke:room-study` — PASS;
- `npm run smoke:reader-notes` — PASS, 4 status-coloured words;
- `npm run smoke:studio-room-srs` — 49/49;
- `npm run smoke:reader-parity` — PASS;
- `npm run smoke:bookmarks` — 11/11;
- `npm run smoke:i18n` — 233/233, locale lock `147`;
- `npm run smoke:canon-version` — 18/18;
- `npm run smoke:memory-canon` — 79/79.

Параллельный запуск нескольких browser-smoke был отброшен как невалидное доказательство: два процесса конкурировали за локальный server state и один увидел скрытый corpus tab. Все browser gates выше после этого запускались последовательно и прошли.

## Что сознательно оставлено B4

B3 не объявляет одинаковые проценты знакомых слов или уровни там, где корпус не имеет соответствующих данных. B4 должен ввести нормализованные presentation-adapters для learner state/readiness/media/provenance, сохранив `null` как честное отсутствие сигнала и различая asserted, derived-high и derived-soft.
