# GROUP_SONG_CORPUS_P0 — закрытый учебный корпус песен

Дата решения владельца: 2026-07-23. Статус: **ENGINEERING IN PROGRESS — local gates green; prod/owner+member pending**.

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

Full 77-song promotion is blocked until P0 passes with the owner and one second member.

## 8. Локальная инженерная верификация

- `group-song-corpus-smoke`: PASS — plan/hash/privacy/idempotency/membership/path/audio.
- `test:api-smoke`: PASS; `smoke:cloud-sync`: 32/32; `smoke:reader-tier3-regression`: PASS.
- Старый `smoke:corpus-room` дошёл до живой страницы, но ожидает прежний L1 Ben-Yehuda сразу
  после клика, тогда как текущий продукт открывает multi-corpus hub; это baseline test drift,
  не разрешение ослаблять новый security gate. Перед release нужен отдельный authenticated
  browser smoke нового group-corpus пути и осознанная актуализация старого smoke.
