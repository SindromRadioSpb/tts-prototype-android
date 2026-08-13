# B8 Reading Journey — research artifacts

Дата среза: 2026-08-13
Goal: research-only, до `APPROVE B8-R`
Рабочее дерево: `main`, `951302392c741a051faf1a95466ff494a2df3757`, приложение `3.11.373`

Этот каталог — воспроизводимая доказательная подложка для
`docs/planning/ROOM_UX_B8_READING_JOURNEY_DECISION_PACKET_2026_08_13.md`.

Содержимое:

- `CURRENT_STATE_INVENTORY.md` — карта identity/store/writer/reader/portable/cloud/conflict для My Texts, Study Songs и Ben-Yehuda;
- `EXTERNAL_RESEARCH.md` — наблюдения из первичных источников и отдельно продуктовые выводы;
- `EVIDENCE_LEDGER.md` — git/runtime/code/synthetic evidence, включая красные или неопределённые harness-сигналы.

Границы сессии:

- product runtime, schema, migrations, LocalDb, service worker и production не изменялись;
- owner profile не открывался; grade/status/progress/note/bookmark/calibration не выполнялись;
- production проверялся только публичными read-only endpoint'ами;
- найденные gaps и test-harness debt только документированы, не исправлялись;
- B0–B7 считаются закрытыми; в этом исследовании не найдено доказательства product regression, которое требовало бы их переоткрытия.

## Минимальное воспроизведение

```powershell
git rev-parse HEAD
git status --short
rg -n "CREATE TABLE IF NOT EXISTS text_progress|CREATE TABLE IF NOT EXISTS bookmarks|CREATE TABLE IF NOT EXISTS notes_v2|CREATE TABLE IF NOT EXISTS note_occurrences|CREATE TABLE IF NOT EXISTS word_status|CREATE TABLE IF NOT EXISTS review_log" public/db/migrations.js
rg -n "setTextProgress|setTextFinished|addBookmark|createCanonicalNote|setWordStatus|commitReviewAttempt|exportStateBundle|importStateBundle" public/db/local-db.js
rg -n "roomCurrentPresentationState|recordProgress|roomMediaSetup|openReader|openGroupCorpusWork|getLearningHomeContinue|READING_LISTS_KEY" public/js/library-ui.js
npm run smoke:reader-resume
npm run smoke:bookmarks
npm run smoke:reader-word-status
npm run smoke:artifact-sync
npm run smoke:cloud-sync
npm run smoke:finished-guard
```

Не запускать owner-live write paths ради воспроизведения research packet.
