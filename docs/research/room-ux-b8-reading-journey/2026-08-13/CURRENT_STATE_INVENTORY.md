# Current-state inventory — B8 Reading Journey

Дата среза: 2026-08-13. Живой код первичен. Термины:

- **canon** — единственный authoritative learner fact;
- **projection** — read-only представление канонов;
- **presentation** — навигационное состояние UI, не learner truth;
- **gap** — отсутствующий или неполный пользовательский контракт;
- **stale claim** — старое описание, не совпадающее с живым кодом.

## 1. Общая карта состояния

| Fact | Stable identity | Canon / field | Writer | Readers | Export/import | Cloud/device | Re-import / conflict |
|---|---|---|---|---|---|---|---|
| Прогресс / «продолжить» | local `text_id`; portable `text_key` | `text_progress.last_row_idx`, `last_step_id`, `updated_at` (`migrations.js:51`) | `setTextProgress()` (`local-db.js:4276`) из `recordProgress()/flushProgress()` (`library-ui.js:4967`) | Reader, My Texts, Study Songs, Ben continue, Learning Home | per-text bundle переносит `text_progress` (`local-db.js:5590`, `6343`) | My Texts — cloud artifact только с consent; Ben/Study — device-local | normal local materialization `mode:skip` сохраняет row; delete/re-import каскадно удаляет. My Text artifact conflict — whole-artifact LWW. Текущий writer может понизить ранее сохранённую строку: session max не merge'ится со stored max |
| Finished | local `text_id`; portable `text_key` | `text_progress.finished_at` (`migrations.js:833`) | только явные `setTextFinished()/clearTextFinished()` (`local-db.js:4291`, `4306`) | Ben finished shelf, Study Songs status/filter, My Text card state | вместе с per-text bundle (`local-db.js:6343`) | как progress | manual-only; `finished_at` импортируется из bundle; отдельного multi-device merge для Ben/Study нет |
| Закладка в отрывке | DB `bookmarks.id`; semantic anchor `text_key + order_index` | `bookmarks` (`migrations.js:760`) | `addBookmark()/removeBookmark()` (`local-db.js:4375`, `4393`) | Reader toggle, global list/search; Ben shelf inject | bundle re-anchor через `order_index` (`local-db.js:5606`, `6305`) | My Texts — в consented artifact; Ben/Study — device-local | survives replace/import только через bundle; delete без переносимого bundle удаляет FK cascade. Import — idempotent re-anchor/union по позиции |
| Сохранённое произведение / reading list | Ben catalog work id внутри device payload | `localStorage.corpus_reading_lists_v1` (`library-ui.js:881`) | `getReadingLists()` и list-picker helpers | Ben browse/list UI | нет canonical bundle | только текущее browser storage | не переживает eviction/new device; это не `bookmarks` и не DB `shelves` |
| Curated route | `shelves.slug`, item `text_key` | `shelves/shelf_items` (`migrations.js:725`); `origin` различает producer canon и user-curated | LocalDb shelf APIs | Reading Room shelf renderer | state bundle | state artifact semantics, где применимо | blob/LWW на уровне shelf; нельзя без решения переименовать в flat saved-work list |
| Text-bound note | `notes_v2.id`, `text_id`; positional target | `notes_v2` (`migrations.js:475`) | `createNote()/updateNote()` (`local-db.js:1751`, `1809`) | Reader/Notes/smart filters | per-text bundle | My Texts consented artifact; Ben/Study device-local | FK/delete риск; bundle restores. Note LWW по `updated_at` |
| Canonical word note | `gen_dedup_key` / lemma-sense; position separately | `notes_v2` with `text_id=NULL` + `note_occurrences` (`migrations.js:684`) | `createCanonicalNote()` + `addNoteOccurrence()` (`local-db.js:2029`, `2089`) | Reader word card, Notes, graph | state bundle exports note; corpus occurrences deliberately excluded | canonical note can sync in state; exact Ben/Study occurrence does not | note survives text re-import; occurrence only reanchors when eligible materialized text exists. `user_touched` content not overwritten by generated refresh |
| Manual word state | normalized `lemma_key` | `word_status.status` (`migrations.js:783`) plus `review_log kind='mark'` | `setWordStatus()` (`local-db.js:3076`) | Reader colors, vocabulary, familiarity | full backup; dedicated learner sync | cross-device learner log | manual-axis LWW by event time/id; projection rebuildable |
| SRS | item key / append-only event id | `review_log` event truth (`migrations.js:868`); schedule projection in `word_status` | atomic `commitReviewAttempt()` (`local-db.js:3384`) | training, familiarity, due counters | full backup + dedicated two-way log sync | cross-device event union | content-deterministic id, `INSERT OR IGNORE`; projection derived after union. Open/close/refresh write zero review events |
| Media asset/timing/binding | package/track/revision/binding ids, SHA | `studio_media_packages`, caption tracks/revisions, `studio_text_media_bindings` (`migrations.js:929–995`) plus compatible material passport | Studio/Import Center repository | Reader media adapter | portable material packages, not learner playback state | local package semantics; catalog media depends on source | package/binding identity is not playback position |
| Media playback position | runtime player time only | **нет durable field** | player/karaoke runtime | current Reader session | нет | ephemeral | teardown clears active player; reopen starts a new media session. `notes_v2.audio_anchor_ms` is a note anchor, not resume truth |
| Presentation continuity | surface/corpus/drill/filter/visible/anchor | `history.state` + session envelope, 8 KiB/24h (`room-b6-core.js:8–17`, `131–183`) | `roomCurrentPresentationState()` + push/replace (`library-ui.js:699`) | popstate/boot restore | нет learner bundle | current tab/session only | navigation presentation; does not replace durable progress. Current Reader anchor is not continuously persisted as exact durable last location |

## 2. Матрица по источникам

| State | My Texts | Study Songs | Ben-Yehuda |
|---|---|---|---|
| Content identity | local `text_id` + stable `text_key`; learner-owned artifact | membership catalog work + materialized local `text_id`/`text_key` | catalog work + served-on-open local materialization by `text_key` |
| Progress / finished | local; cloud only after `cloud_texts` consent v2 | local only | local only |
| Passage bookmarks | local; in consented per-text bundle | local only after materialization | local only after materialization |
| Saved work/list | сам My Text уже находится в библиотеке; отдельного saved-work writer нет | membership catalog is the list; отдельного saved-work writer нет | named reading lists in localStorage only |
| Text-bound notes | local; in consented artifact | local only | local only |
| Canonical lemma note / word status / SRS | note/state and review-log routes according to their own sync contracts | same lemma/SRS canon; exact occurrence on corpus does not travel | same lemma/SRS canon; exact occurrence on corpus does not travel |
| Media resume | exact seconds absent | exact seconds absent | exact seconds absent; canonical baked audio availability is separate |
| Presentation | History/session only | History/session only | History/session only |
| Eviction recovery | artifact cloud only if consented; otherwise ZIP backup | full ZIP backup only for learner-local facts | full ZIP backup only for learner-local facts; Ben reading lists are not in DB backup |

## 3. Canon, presentation, gap, stale-document verdict

### Уже один канон

- Passage bookmark: `bookmarks`; не создавать localStorage/History дубль.
- Note content: `notes_v2`; word position: `note_occurrences`.
- Manual word state/SRS: append-only `review_log` plus rebuildable `word_status` projection.
- Finish and row progress: `text_progress`; UI surfaces must только читать/писать через LocalDb.
- Media package/timing: Studio media tables/passport; это content binding, не learner resume.

### Только presentation

- History/session state возвращает к surface/corpus/filter/reader и предотвращает лишний `touchOpened` при history restore.
- TTL 24h и 8 KiB делают его пригодным для навигации, но не для cross-device, eviction recovery или learner audit.

### Реальные B8 gaps

1. `last_row_idx` сейчас может понизиться: `mergeProgress()` учитывает max только внутри новой сессии, а normal reopen не seed'ит session max из stored progress.
2. Нет единого честного cross-source read-only представления «продолжить / закладки / законченные / с заметками»; существующие readers разбросаны между Ben shelf, Study filter, My cards и Learning Home.
3. Ben saved-work list и passage bookmark — разные контракты, но продукт не объясняет recovery/device boundary последовательно; reading list не переносим.
4. Exact media `currentTime` не канонизирован. Row progress может приблизительно вернуть к строке, но не к секунде.
5. Ben/Study personal journey state не cloud-sync'ится и может исчезнуть при storage eviction/delete/re-materialization; Room не просит/не показывает persistent-storage status.
6. Global `bookmarks` способен содержать позиции всех materialized sources, но discovery shelf внедряется в Ben path; cross-source retrieval неполон.

### Не считать gaps регрессиями B0–B7

- `BRR_READING_UX_REQUIREMENTS_2026_06_15.md` уже отмечал требование max(stored, session); живой код подтверждает, что это старый backlog, а не новая B7 regression.
- Legacy `#tabCorpus` был скрыт закрытой IA B0–B5; smoke, который продолжает кликать его, устарел.
- B7 намеренно моделирует `audio:none` как typed media state. Старый media smoke, требующий полного отсутствия chip у plain text, противоречит закрытому B7 contract test.

## 4. Conflict semantics, которые нельзя смешивать

| Data class | Текущая политика | B8 constraint |
|---|---|---|
| Review events | set union by deterministic event id | только append-only; никаких update/delete для «удобного journey» |
| Manual status | LWW replay over `mark` events | не выводить статус из notes/bookmarks |
| My Text artifact | whole-artifact LWW by `texts.updated_at`; server-newer replaces locally | UI должен предупреждать о consent/device boundary; B8 не меняет server contract |
| Notes/state bundle | note/shelf LWW/merge по соответствующим updated markers | journey — reader, не writer |
| Passage bookmarks | local unique position, import re-anchor/union | semantic anchor `text_key + order_index`; DB id не переносить как глобальную identity |
| Progress | overwrite row/step today | immediate B8 recommendation: monotonic row merge; не придумывать second last-location store |
| Presentation | latest session/history state | никогда не повышать до learner canon |
| Ben saved lists | current localStorage payload | device-local; не маскировать как synced/recoverable |
