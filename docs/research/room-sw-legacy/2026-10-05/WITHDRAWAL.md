# Отказ от URL-marker hotfix после P1 review

Дата: 2026-10-05. Исходный кандидат: `eedae5cb4392ed5c0fdf508ffb533d94bd6270cd`, draft PR #12. Решение: удалить marker-only activation/navigation, сохранить production 3.11.730 и предложить закрыть hotfix без выпуска. Новый exact commit передаётся на повторный независимый review; merge/deploy до него не выполняются.

## Подтверждённый P1

Независимый reviewer на точном eedae5cb воспроизвёл два случая в реальном Chromium:

1. URL с точным `room_update=3.11.731` открыт без update-click. Пользователь вводит новый несохранённый meaning/mnemonic в настоящем редакторе заметки. После окончания install SW принудительно navigates окно, черновик исчезает.
2. Пользователь действительно нажал первый update-click во время install; старый controller вернул 729 с marker. После этой навигации пользователь начинает **новый** черновик. При окончании install SW опять принудительно navigates окно и удаляет текущий несохранённый черновик.

В обоих случаях сохранённые notes_v2 остались прежними. Поэтому прежнее сравнение 50 SQL таблиц и зелёный CI не доказывали сохранность несохранённого UI-состояния. Старый marker не доказывает актуальный safe-point страницы. Проверка same-origin/path/version и SHA-256 проверяет адрес и shell bytes, а не текущий черновик или согласие пользователя.

Независимый источник: `C:\Users\lletp\AppData\Local\Temp\lp-review-eedae5cb-a6f67595\review-final.json`. Его обезличенный P1-фрагмент и SHA-256 оригинала: [independent-review-p1.json](evidence/independent-review-p1.json). Owner DB/profile при review не использовались; слова, заметки и входные строки синтетические.

## Минимальное изменение

Удалены `confirmedRoomUpdateClients`, install `skipWaiting()` по marker и activate `client.navigate()` по marker. Отменены связанный version731 и cache-key bumps. Пять runtime-файлов — `public/sw.js`, `public/library.html`, `public/js/library-ui.js`, `public/index.html`, `server.js` — **байт-в-байт совпадают** с выпущенным main `5f683507fd5bc993e468f9785648cdb070843ef2`; runtime diff к main отсутствует. Исходный B6.3 запрет install auto-activation восстановлен.

Новый worker/page handshake или постоянный журнал consent не добавлены. Имеющийся explicit `SKIP_WAITING` message-контракт 730 сохранён. Для уже исполняющегося legacy JS без нового актуального safe-point известный второй click допустим. Несохранённый редактор не закрывается автоматически из-за URL marker или прошлого click.

Это не улучшает update-поведение относительно production730 и не устраняет legacy два click. Поэтому отдельный product hotfix/release не оправдан. Тесты и исследование можно сохранить для будущего согласованного изменения; выпуск ради удаления механизма, который никогда не был в production, не требуется.

## Реальные regression tests

[sw-room-draft-browser-smoke.js](../../../../scripts/premium/sw-room-draft-browser-smoke.js) экспортирует неизменённый historical729 через git archive и запускает реальный target source на собственных loopback-серверах с одноразовыми DATA_DIR/browser contexts. .env выключен, cross-origin requests запрещены, provider calls и owner-профиль не нужны. Native SW остаётся включён; тело приложения не подменяется. Critical target module удерживается до появления настоящего несохранённого редактора.

В обоих сценариях fixture открывает локальный synthetic text, сохраняет слово, открывает настоящий note editor, вводит meaning и mnemonic, **не нажимая сохранение этой правки**. Поля читаются до и после; отдельно проверяются document identity, main-frame navigation requests, controller version, installed waiting state, неизменность saved notes hash и отсутствие navigation другой вкладки.

| Actual target source | Поддельный marker, update clicks 0 | Новый draft после настоящего первого update click |
| --- | --- | --- |
| Отклонённый eedae5cb /731 | 1 принудительная navigation, draft потерян | 1 принудительная navigation, draft потерян |
| Восстановленный main730 | navigation0, тот же документ и оба draft-поля; target waiting | navigation0, тот же документ и оба draft-поля; target waiting |

Before mode явно называется `reproduced-p1`, а не PASS исправления. After mode требует сохранения unsaved fields; unchanged SQL alone не может дать ему PASS. Evidence: [before](evidence/sw-draft-before-withdrawal.json), [after](evidence/sw-draft-after-withdrawal.json).

```text
node scripts/premium/sw-room-draft-browser-smoke.js
node scripts/premium/sw-room-draft-browser-smoke.js --current-root=<immutable eedae5cb source> --expect-draft-loss
node scripts/premium/sw-legacy-room-browser-smoke.js
node --test tests/swLegacyRoomUpdate.test.js tests/roomB6ScaleResilience.test.js
npm test
npm run smoke:sw-update
node scripts/premium/room-discovery-corpus-guard.js
```

Historical update smoke теперь по умолчанию требует **два** explicit clicks, соответствующих сохранённому730; режим одного click используется только для наблюдения архивного отклонённого кандидата. Новый draft smoke добавлен в CI. Четыре runtime unit доказывают, что точный marker не активирует worker, activate не navigate окна, explicit message отдельно работает, incoherent shell не устанавливается.

Сводка итоговых проверок и hash логов: [withdrawal-gates.json](evidence/withdrawal-gates.json). Hosted CI нового exact commit проверяется отдельно, старый зелёный CI eedae5cb не является его приёмкой.

В первых двух локальных after-прогонах черновик сохранялся, но ошибочное async `waitForFunction` преждевременно разрешало ожидание worker. Минимальный опыт с установленным Playwright: `waitForFunction(async () => false)` вернул false за29ms вместо повторного опроса. Ожидание заменено явным bounded async polling и стабильным installed waiting state; assertions сохранения draft/navigation/worker не ослаблены. Первые неуспешные логи/JSON сохранены в `.tmp`, hashes указаны в сводке. Это defect тестового ожидания, не доказательство потери черновика на730.

## Границы и следующий шаг

Оригинальная причина облачного two-click эпизода без pre-click worker trace остаётся неустановленной. Промежуточная active728/waiting729/target цепочка остаётся с двумя click; мы не объявляем её исправленной. Эти ограничения не разрешают удалять текущий несохранённый draft.

Нужен повторный независимый review нового exact commit и его regression readback. После него предлагается закрыть PR #12 как отказ от небезопасного hotfix **без production-релиза**. Runtime730 не откатывается, owner cache/OPFS/DB не очищаются, Ben-Yehuda материалы/архивы не публикуются. Наблюдение O-075 остаётся открытым для отдельной задачи update UX.
