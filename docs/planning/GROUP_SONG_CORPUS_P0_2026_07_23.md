# GROUP_SONG_CORPUS_P0 — закрытый учебный корпус песен

Дата решения владельца: 2026-07-23. Статус: **FULL 77 OWNER_LIVE — production owner API/UI PASS; second-member live pending**.

## 1. Решение

Создать один серверный корпус `GROUP_RESTRICTED` для небольшой учебной группы. Контент и общий
TTS хранятся один раз; `review_log`, `word_status`, FSRS, личные заметки, прогресс и другие
learner-данные остаются строго per-user. Корпус не является частью публичного Ben-Yehuda и не
публикуется под `/public`, `/data/benyehuda` или через keyless audio-cache URL.

Первоначальный H2.3 `propose_import_text` и `propose_track_word` отложены. Goal-family можно
исполнять независимо после P0. Новые Hermes-инструменты группового корпуса допустимы только
после зелёного серверного пилота и только аддитивно — существующие MCP-схемы не меняются.

## 2. Источник и факт-инвентаризация

Источник владельца (локально, не коммитить):
`C:\Users\lletp\Downloads\library-bundle-20260723-092730.zip`.

- ZIP SHA-256: `ccdb1ce50606e5c706a9b1e4e4a0101a51a8fe7d699eedf7e58f449ae922f036`.
- Размер: 366,702,624 bytes; 8,884 entries.
- Полный backup: 188 texts / 15,053 rows, а не отдельный song-only export.
- 106 текстов имеют `source_meta.corpus`; они не входят в promotion.
- 82 текста не имеют corpus-meta и являются личными.
- Из них ровно 77 заголовков соответствуют `^Position <N>.` в диапазоне 1…101.
- Пять остальных личных текстов (три словарных списка, agent draft и фрагмент пьесы) исключены.
- 77 песен: 3,106 строк; 3,039 audio references; все 3,039 MP3 физически присутствуют в ZIP.
- Полный ZIP всё же `partial_backup:true`: 40 отсутствующих audio assets относятся к другим
  текстам backup и не пересекаются с выбранными 77 песнями.

Position — только UI-порядок. Идентичность миграции строится по исходному `text_key`, а Position
сохраняется лишь как display/order metadata.

## 3. Три пилотных произведения

| Position | Title | text_key | Rows | Audio | Notes | Morph |
|---:|---|---|---:|---:|---:|---:|
| 1 | אושר כהן - כולם גנבים | `7f26c9e549c1ae29ca38da38eab234ab4aafb36dd1338771be32a43403692ff8` | 42 | 42 | 132 | 42 |
| 13 | אושר כהן - באמת של האמת | `dac18b72256b35e614838b0d5496dd6e952a3bd40c5cbd52a9329549d31b4239` | 64 | 56 unique MP3 | 190 | 64 |
| 101 | עומר אדם - רק שלך (By Osher Cohen) | `text-1780675232774` | 58 | 2 unique MP3 | 6 scoped notes | 58 |

Пилот специально покрывает: полностью заполненный текст; богатый notes-граф; честное частичное
TTS-покрытие без синтеза отсутствующих 56 строк.

`Audio` в этой таблице — уникальные физические assets, а не количество row references. Шесть
заметок Position 101 — canonical notes, включённые через scoped occurrences; прямых text-bound
notes у него нет. Всего в пилоте: 164 строки, 100 MP3, 328 scoped notes, 164 morph rows.

## 4. Хранилище и доступ

- Метаданные групп, membership, корпусов, works и audio-map — SQLite, user/group scoped.
- Bundle/MP3 — persistent volume `DATA_DIR/group-corpora/<corpus>/<version>/...`, вне git.
- Выдача каждого каталога/work/audio требует authenticated user + ACTIVE membership.
- Отсутствующий или чужой corpus возвращается как not-found; membership нельзя угадывать.
- Тексты и audio имеют `Cache-Control: private`; service worker не кладёт их в публичный cache.
- Importer принимает только явный список Position/text_key, проверяет SHA-256 источника, не
  переносит global state и работает идемпотентно.
- Сначала copy/promote; исходная OPFS-библиотека не удаляется.

## 5. Что переносится

Переносятся: text metadata, исходный текст, rows, огласовки, переводы, транслитерации,
`edit_meta`, TTS profile, text-bound notes/versions/links, sentence morphology, переносимые
occurrence-якоря и только реально referenced MP3.

Не переносятся в общий слой: `review_log`, `word_status`, FSRS/SRS, `study_day`, Anki state,
events, личные bookmarks/progress и text-independent learner notes. Они продолжают жить в
существующем per-user контуре и накладываются по стабильным `text_key`/lemma keys.

## 6. Rights/provenance boundary

Каждый work получает `rights_status: REVIEW_REQUIRED`, source/artist provenance и пометку
`educational_group_restricted`. До отдельного rights-решения запрещены public listing,
cross-group reuse, model training и экспорт корпуса как публичного asset. Малый размер группы,
пароль и учебная цель уменьшают риск, но не заменяют лицензию/fair-use assessment.

## 7. P0 acceptance

1. Synthetic smoke: owner/member can list/open/audio; outsider and anonymous cannot.
2. Importer: source hash gate; selection 1/13/101; no global learner arrays; referenced audio only.
3. Parity: title/text_key/row counts, per-row fields, notes/morph counts and MP3 SHA-256 match source.
4. Existing Ben-Yehuda, personal artifact sync and 18 MCP schemas remain byte-identical.
5. Reading Room opens all three through the existing bundle/import reader path.
6. No copyrighted body or MP3 enters git, stdout, public static paths or test fixtures.
7. Rollback: archive/disable corpus + revoke memberships; delete only the bounded
   `DATA_DIR/group-corpora/<corpus>` tree after an inventory and owner approval.

Первоначальный gate требовал owner + second-member до full promotion. После owner-live пилота
владелец явно разрешил перенос оставшихся карточек 2026-07-23; second-member boundary остаётся
обязательным заключительным live-gate, но не блокирует уже выполненный закрытый перенос.

## 8. Локальная инженерная верификация

- `group-song-corpus-smoke`: PASS — plan/hash/privacy/idempotency/membership/path/audio.
- `test:api-smoke`: PASS; `smoke:cloud-sync`: 32/32; `smoke:reader-tier3-regression`: PASS.
- Старый `smoke:corpus-room` дошёл до живой страницы, но ожидает прежний L1 Ben-Yehuda сразу
  после клика, тогда как текущий продукт открывает multi-corpus hub; это baseline test drift,
  не разрешение ослаблять новый security gate. Перед release нужен отдельный authenticated
  browser smoke нового group-corpus пути и осознанная актуализация старого smoke.

## 9. Production evidence

- Code/image: `2202f0f` / `3.11.224`; migration `056_group_song_corpus_p0` applied; health ready.
- Corpus `study-songs-pilot`: 3 works / 164 rows / 100 unique MP3 / 328 scoped notes /
  164 sentence-morph rows; active memberships: owner only.
- Authenticated owner API: catalog 1, works 3, work bundle 200, protected audio HEAD 200;
  the temporary verification session was logged out.
- Anonymous `GET /api/group-corpora`: 401. All 100 MP3 hashes and all 3 bundle hashes match DB;
  shared learner-array rows: 0.
- Full source ZIP was removed from host and container after import. The owner's source file in
  `Downloads` remains the recovery source. Production retains only the bounded pilot payload.
- Disk after deploy/import: approximately 80–81%, 7.3 GB free; health `disk_warn:true`.

P0 stays `OWNER_LIVE`, not `CLOSED`: owner open/play and full-catalog UI passed; a second
registered member must independently see/open/play a work, while a non-member must not.

## 9.1 Full 77 production promotion

По явному owner-go остальные 74 Position-карточки добавлены в тот же `study-songs-pilot`;
пилотные Positions 1/13/101 намеренно не переимпортировались. Первый all-77 APPLY честно
остановился до мутации на `TARGET_HASH_MISMATCH` старого byte-identical r1 pilot bundle;
повторный bounded APPLY выбрал только оставшиеся 74 и завершился успешно.

- Итог: 77 works / 3,106 rows / 2,160 per-work audio rows / 2,155 unique MP3 files /
  7,510 scoped notes / 3,065 sentence-morph rows.
- Все 77 bundle SHA-256 и все 2,160 audio-row SHA-256 совпадают с сохранёнными файлами.
- Все works остаются `audio_revision=1`; новая TTS не синтезировалась.
- Общие learner arrays пусты; progress/bookmarks/pins не перенесены; membership остался owner-only.
- Временный ZIP/report удалены с prod; локальный owner ZIP сохранён как recovery source.
- Живой owner UI: group hub показывает `77 текст(ов) · владелец`, внутри отрисованы 77 cards.
- После переноса health/db/migrations готовы; disk warning достиг 92%, поэтому следующий deploy,
  TTS r2 и дальнейший корпусный рост заблокированы до bounded Docker cleanup.

P0 остаётся `OWNER_LIVE`: требуется независимая проверка вторым ACTIVE member и негативная
проверка non-member перед `CLOSED`.

## 10. P0.1 — replaceable TTS + karaoke editions

Owner-live confirmed all three works open/play, and exposed mixed karaoke coverage in legacy audio.
The correction is an edition model, not in-place MP3 overwrite:

- work catalog exposes `audio_revision`, profile, publication time and current `bundle_sha256`;
- each revision writes new immutable salted asset keys under `audio-r<N>/` plus a timing sidecar;
- timing is accepted only at complete `got == n` word coverage with contiguous offsets;
- DB pointer flips only after every selected work is baked and verified; old DB rows/files remain
  reachable during client transition and for rollback;
- Reading Room compares the catalog bundle hash with its local edition marker. A new hash runs
  `importBundle(mode=skip)` + `reconcileAudioLinks`, changing only default sentence audio by stable
  `order_index`; text, notes, bookmarks and progress are not replaced;
- protected `/timing` uses the same authenticated membership boundary as MP3. A revision without
  timing returns 404 and honestly remains sentence-level karaoke.

Developer workflow (default is plan; no provider call or write):

```text
node scripts/premium/group-corpus-revoice.js \
  --db-path <DB_PATH> --data-dir <DATA_DIR> \
  --corpus-id study-songs-pilot --revision 2 \
  --voice he-IL-Wavenet-A --rate 1 --pitch 0
```

Apply requires `GCP_TTS_API_KEY`, `--apply`, and an explicit
`--confirm-cost-max-clips <N>` at least as large as the PLAN `unique_clips`. Concurrency is capped
at 4. Revision must be strictly newer. Failed/partial timing never becomes current.

Production mechanism evidence (2026-07-23): commit `0289d42`, app `3.11.225`, migration 057
ready, protected timing route returns 401 without a session, and a live container PLAN for the
three pilot works reports 164 rows / 129 unique clips for revision 2. No provider call or file/DB
write was made. The host is at 87% disk use, so an APPLY is blocked until bounded space recovery,
then requires owner selection of the voice/profile and a cost cap of at least 129 clips. The
currently published revision remains r1; this deploy provides the safe replacement path, not new
audio itself.

## 11. P1 — premium library surface (v3.11.226)

Владельцем утверждена UX-паритетность с Библиотекой Студии для закрытого песенного корпуса.
Паритет означает одинаковую скорость поиска и возврата к чтению, но не перенос редакторских или
опасных действий в поверхность участника.

- Каталог: широкие вертикальные cards; Position, заголовок, исполнитель (без визуального дубля),
  строки, фактическое audio-покрытие, активная TTS revision, теги и локальный progress bar.
- Retrieval: поиск по title/artist/topic/level/tag/Position; фильтры status и audio coverage;
  сортировка по исходному порядку, недавнему открытию, прогрессу и названию; tag chips; те же
  восемь personal smart filters, что в Студии (`recent/struggling/mastered/fresh/notes/SRS`).
- Действия: `Продолжить` появляется только при локальном `text_progress`; `Открыть` начинает с
  начала; `Поделиться` создаёт deep link с `corpus_id/work_id`, но не содержит тела/аудио/token.
  Получатель снова проходит session + ACTIVE membership; чужой/анонимный пользователь не может
  определить существование корпуса по ссылке.
- Learner overlay остаётся per-browser/per-user. Серверный общий слой не получает progress,
  bookmarks, notes, FSRS/review_log или word_status. Изменение UI не меняет reader/TTS/караоке.
- Миграция 058 добавляет только searchable projection (`level/topic/tags/source_created_at`) к
  work-каталогу. Канон текста остаётся в protected bundle; backfill идемпотентно строит проекцию
  из bundle после проверки SHA-256 и никогда не печатает copyrighted body.

### Owner-only backup header

Четыре действия видны только membership-role `OWNER`; для MEMBER DOM-кнопок нет.

1. `Экспорт JSON` — каталоговые метаданные, без тел, аудио и learner-state.
2. `Импорт JSON` — только полный exact-set существующих works; может обновить display metadata,
   но не content bundle, TTS и learner-state. Session + OWNER + same-origin + CSRF обязательны.
3. `Экспорт ZIP` — private backup всех зарегистрированных work/audio/timing файлов с manifest;
   каждый файл проверяется по DB size/SHA-256 до начала ответа.
4. `Импорт ZIP` — recovery-only: manifest должен точно совпасть с DB inventory и SHA-256; можно
   восстановить отсутствующий файл, но существующий файл с другим hash не перезаписывается.

ZIP остаётся restricted copyrighted material: не публиковать, не класть в git/public и не
передавать участникам автоматически. Rollback P1: отключить owner import/export routes и вернуть
старый renderer; migration 058 можно оставить (nullable additive columns), content/TTS/learner
data не требуют обратной миграции.

Локальные гейты: `smoke:group-song-corpus`, `smoke:group-corpus-api` (owner import/export,
CSRF, anonymous deny, hash verification), `smoke:group-corpus-ui` (@380 light/dark + @1280),
`smoke:i18n`, `smoke:studio-agent`, `smoke:reader-tier3-regression`, `test:api-smoke` — PASS.
Перед production closure обязательны: migration 058, catalog backfill PLAN/APPLY, owner API/UI
проверка, MEMBER UI (без backup header), anonymous/non-member negative checks и deep-link live.

## 12. P2 — одноразовый MEMBER-вход и встроенная справка (v3.11.228)

Owner-go 2026-07-23: закрыть second-member gate без общей публичной регистрации. Принят
passwordless-путь для малой группы:

- `JOIN`-ссылка создаёт нового `users.role=member` и ACTIVE membership;
- `LOGIN`-ссылка из строки существующего участника создаёт новую PWA-сессию ТОГО ЖЕ user_id,
  поэтому прогресс не дробится на дубликаты;
- ссылка одноразовая, TTL 24 часа, сырой 256-bit token существует только в URL fragment и POST;
  SQLite хранит только SHA-256. Preview не расходует token, redeem требует явного действия;
- owner может отозвать ссылку, отозвать/вернуть membership и выпустить повторный LOGIN.
  Отзыв membership немедленно закрывает corpus/work/audio на уже выданных сессиях, потому что
  каждый read повторно проверяет ACTIVE membership;
- вход владельца по `AUTH_BOOTSTRAP_SECRET` остаётся отдельным и не создаёт MEMBER;
- один browser profile жёстко привязывается к одному cloud user_id в localStorage. Смена аккаунта
  без отдельного профиля блокируется до синка, чтобы OPFS одного ученика не ушёл в аккаунт другого;
- встроенная справка живёт в ☁ и в corpus-access модале: owner видит JOIN/LOGIN/revoke-процесс,
  MEMBER — приватность learner-overlay и процедуру входа на новом устройстве.

Migration 059 добавляет только `group_access_invites`; learner-state и corpus content не меняются.
Rollback: отключить invite endpoints/UI и отозвать ACTIVE invites; существующие users/memberships
не удалять автоматически. Гейты: API — JOIN/LOGIN/replay/origin/CSRF/hash/isolation/revoke;
UI — owner help/member controls/explicit preview/@380px; i18n ru/en/he.

Практическая справка не должна оставаться только в planning-документе. Её канонические точки
в самом продукте: раздел «Как устроен доступ» в модале `☁ Синхронизация` и role-aware справка
в модале «Участники и приглашения» / «Доступ к учебной группе». При изменении auth-процесса
обновляются одновременно ru/en/he-тексты обеих точек и smoke `group-corpus-ui`.
