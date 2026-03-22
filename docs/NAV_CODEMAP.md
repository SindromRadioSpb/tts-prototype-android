# NAV_CODEMAP — entrypoints + data flows + state (PRO-PREMIUM)

Цель: дать детерминированную карту навигации по совпадениям (NAV) и jump-to-sentence,
так чтобы:
- агент/Claude Code быстро понял: “что вызывает что”, “какое состояние где хранится”
- исключить путаницу между hits/results/session/origin/scroll
- любая правка в NAV имела чёткую точку входа для smoke/e2e

Связанные документы:
- docs/GLOSSARY_DOMAIN.md (сущности и anti-confusion)
- docs/UI_MAP.md (selectors + data-attrs контракт)
- docs/CONTRACTS_NAVIGATION.md (форматы, boot rules, deeplink)
- docs/schemas/* (Target/DeepLink/SearchSession)

---

## 1) Mental model (в 20 секунд)

NAV работает поверх “последнего поиска”:

1) Поиск формирует:
   - notesResults[] и/или rowsResults[]
   - origin (lib/dash)
   - activeType + activeIndex
   - scrollRestore (позиция модала)

2) При клике по hit → вызываем jump:
   v3NavOnHitJump(...) → v3NotesJumpStub(textId, sentenceId, orderIndex)

3) Sticky-bar позволяет:
   - Prev/Next: перемещение по results[] без пересборки поиска
   - Back: открыть исходный модал и восстановить scroll + активный hit

---

## 2) Entry points (UI → handlers)

### 2.1. Hit click (matches list)
Источник: элемент `.v3-note-hit` (см. UI_MAP → Hit Contract)

Handler:
- `v3NavOnHitJump(type, index, textId, sentenceId, orderIndex, originScope)`
  - фиксирует origin/activeIndex/scrollRestore
  - вызывает `v3NotesJumpStub(...)`
  - показывает sticky bar после jump (deferred)
  Evidence: index.html:contentReference[oaicite:20]{index=20}

### 2.2. Sticky bar buttons
UI:
- `#v3NavPrevBtn` → Prev
- `#v3NavNextBtn` → Next
- `#v3NavCloseBtn` → Close
- `#v3NavBackBtn` → Back-to-matches
Evidence (bind): index.html:contentReference[oaicite:21]{index=21}

### 2.3. Sticky bar hotkeys (когда бар видим)
- Escape → hide bar
- ArrowLeft → Prev
- ArrowRight → Next
Не перехватывается ввод в input/textarea/contenteditable.
Evidence: index.html:contentReference[oaicite:22]{index=22}

### 2.4. Reload restore (после F5)
- `window.addEventListener("load", ...)`:
  - если есть session “последний текст” → reopen
  - оффлайн: попытка восстановить таблицу из кэша
Evidence: index.html:contentReference[oaicite:23]{index=23}

---

## 3) State layers (что где хранится)

### 3.1. SearchSession (sessionStorage) — NAV state
Источник: `sessionStorage[V3_SEARCH_SESSION_KEY]` (JSON)
Операции:
- `v3SearchSessionGet()`
- `v3SearchSessionSet(patch)`
- `v3SearchSessionReset()`
- `v3SearchSessionPersist(st)`
Evidence: index.html:contentReference[oaicite:24]{index=24}

Минимальные поля, которые реально используются NAV:
- `origin`: "lib" | "dash"
- `activeType`: "notes" | "rows"
- `activeIndex`: number (0-based)
- `notesResults`: array (hits)
- `rowsResults`: array (hits)
- `qRaw`: string (для восстановления input при Back)
- `scrollRestore`: object с ключами `"<origin>:<type>" → { scrollTop, savedAt }`
Evidence (capture scroll): index.html:contentReference[oaicite:25]{index=25}

Инварианты:
- `activeIndex` всегда трактуется как 0-based, clamp по длине списка.
- `orderIndex` в hits — позиционный индекс (НЕ ID). (см. CONTRACTS/GLOSSARY)

### 3.2. v3Session (restore-on-load) — “последний открытый текст”
Источник: `v3SessionGet()` (отдельный слой, не SearchSession).
Используется только для reopen после reload.
Evidence: index.html:contentReference[oaicite:26]{index=26}

---

## 4) Data flows (основные сценарии)

### 4.1. Search → results → render matches → jump
1) Поиск (lib/dash) формирует `notesResults` и/или `rowsResults` и пишет в SearchSession.
2) UI рендерит matches list (hits).
3) Пользователь кликает hit → `v3NavOnHitJump(...)`:
   - `origin` + `activeType/activeIndex` + `scrollRestore` сохраняются
   - выполняется `v3NotesJumpStub(textId, sentenceId, orderIndex)`
   - sticky bar показывается по завершении (deferred)
Evidence: index.html:contentReference[oaicite:27]{index=27}

### 4.2. Prev/Next (без пересборки поиска)
1) Prev/Next читает SearchSession → определяет активный список (notes/rows).
2) Вызывает `v3NavJumpByIndex(type, newIndex)`:
   - ставит `activeType/activeIndex`
   - вызывает `v3NavOnHitJump(...)` с ids из hits
Evidence: index.html:contentReference[oaicite:28]{index=28}:contentReference[oaicite:29]{index=29}

### 4.3. Jump-to-sentence (фактический переход)
`v3NotesJumpStub(textId, sentenceId, orderIndex)`:

Путь A (text уже открыт):
- найти rowIdx по sentenceId
- setRowSelectedUI + scrollIntoView + flash
- auto-open Notes modal (если доступно) + highlight needles (best-effort)
- закрыть Library/Dashboard модалы
Evidence: index.html:contentReference[oaicite:30]{index=30}

Путь B (нужно открыть другой text):
- закрыть Dashboard, если открыт
- `v3LibraryOpenText(textId, { resumeSentenceId: sentenceId, origin:"notes", openMode:"jump" })`
- после стабилизации DOM: flash row + попытка auto-open notes
Evidence: index.html:contentReference[oaicite:31]{index=31}:contentReference[oaicite:32]{index=32}

Failure behavior:
- пустые ids → toast “пустой textId/sentenceId”
- ошибки open/jump → toast “Не удалось перейти…”
Evidence: index.html:contentReference[oaicite:33]{index=33}:contentReference[oaicite:34]{index=34}

### 4.4. Back-to-matches (origin + scroll + active highlight)
`v3NavBackToMatches()`:
1) Открыть исходный модал по `origin` (lib/dash).
2) Восстановить matches из кеша SearchSession:
   - `v3NavEnsureMatchesRendered(origin)` (без сети)
3) В `setTimeout`:
   - `v3NavRestoreMatchesScroll(origin, type)`
   - `v3NavMarkActiveHitWithRetry(origin, type, idx, 0)`
Evidence: index.html:contentReference[oaicite:35]{index=35}:contentReference[oaicite:36]{index=36}

`v3NavEnsureMatchesRendered(origin)`:
- подставляет `qRaw` в input исходного модала
- если есть results → рендерит через `v3NotesRenderMatches`/`v3RowsRenderMatches`
Evidence: index.html:contentReference[oaicite:37]{index=37}

---

## 5) URL / DeepLink / Boot priority — статус

### 5.1. Контрактный boot priority (должно быть)
По `docs/CONTRACTS_NAVIGATION.md` boot должен идти:
1) hash deep link
2) query
3) sessionStorage
Evidence: CONTRACTS_NAVIGATION.md

Deep link формат:
- `/#/t/<payload>`, `payload = base64url(JSON)`
Evidence: CONTRACTS_NAVIGATION.md

### 5.2. Текущая реализация (по evidence из index.html)
В найденных фрагментах index.html НЕ подтверждены:
- `hashchange` listener
- код decode/encode base64url deeplink
- `resolveTarget()` как runtime-вход
Следствие:
- NAV работает от SearchSession и UI, но не имеет доказанного URL-entrypoint.
Это не баг документа; это **gap** между контрактом и реализацией и должен закрываться патчами NAV deep-link.

---

## 6) Function map (таблица “функция → вход/выход/side effects → контракт”)

| Function | Вход | Выход | Side effects (state/UI) | Связанный контракт/док |
|---|---|---|---|---|
| `v3NavOnHitJump` | type,index,textId,sentenceId,orderIndex,originScope | Promise | set origin, set active, capture scroll, call jump, show sticky | UI_MAP (Hit), SearchSession, Jump flow:contentReference[oaicite:40]{index=40} |
| `v3SearchSessionCaptureScroll` | type, originScope | void | пишет scrollRestore в SearchSession | SearchSession invariants:contentReference[oaicite:41]{index=41} |
| `v3NavStickyBindOnce` | — | void | bind click handlers + hotkeys | UI_MAP (sticky ids):contentReference[oaicite:42]{index=42} |
| `v3NavStickyShow/Hide` | — | void | показывает/прячет bar, inline style safety | UI_MAP (sticky ids):contentReference[oaicite:43]{index=43} |
| `v3NavStickyUpdate` | — | void | pos label, enable/disable prev/next/back | SearchSession fields:contentReference[oaicite:44]{index=44} |
| `v3NavJumpByIndex` | type,newIndex | Promise | set activeType/Index, call v3NavOnHitJump | NAV prev/next flow:contentReference[oaicite:45]{index=45} |
| `v3NavPrev/Next` | — | Promise | clamp, dispatch to JumpByIndex | NAV prev/next flow:contentReference[oaicite:46]{index=46} |
| `v3NotesJumpStub` | textId,sentenceId,orderIndex | Promise | open text if needed, select row, flash, open notes | Jump-to-sentence spec:contentReference[oaicite:47]{index=47} |
| `v3NavBackToMatches` | — | void | open origin modal, render from cache, restore scroll/highlight | Back-to-results contract:contentReference[oaicite:48]{index=48} |
| `v3NavEnsureMatchesRendered` | origin | void | set input qRaw, render matches from cached results | Back-to-results contract:contentReference[oaicite:49]{index=49} |
| `v3SearchSessionGet/Set/Reset` | patch | state/void | sessionStorage persist | SearchSession schema:contentReference[oaicite:50]{index=50} |
| `window.load restore` | — | void | reopen last text / offline restore | restore-on-load:contentReference[oaicite:51]{index=51} |

---

## 7) Error handling / guards (операционный слой)

- “Пустой textId/sentenceId” при jump → toast error; не пытаемся открывать текст.
  Evidence: index.html:contentReference[oaicite:52]{index=52}
- Ошибка jump/openText → console.warn + toast error.
  Evidence: index.html:contentReference[oaicite:53]{index=53}
- Sticky bar скрывается, если в SearchSession нет hits.
  Evidence: index.html:contentReference[oaicite:54]{index=54}
- Back кнопка disabled, если нет hits или origin некорректен.
  Evidence: index.html:contentReference[oaicite:55]{index=55}
- Restore-on-load: при offline пытается восстановить таблицу из кэша, иначе сообщает.
  Evidence: index.html:contentReference[oaicite:56]{index=56}

---

## 8) Mini smoke (для человека/агента)

1) Найти `v3NavOnHitJump` → убедиться, что state фиксируется до jump и sticky показывается после.
2) Найти `v3NavPrev/Next` → убедиться, что они идут через `v3NavJumpByIndex`, без rebuild поиска.
3) Найти `v3NavBackToMatches` → убедиться: open origin modal → ensureRendered → restore scroll + highlight.
4) Найти `v3SearchSessionGet/Set` → подтвердить persist в sessionStorage.
5) Проверить `CONTRACTS_NAVIGATION.md`: boot priority hash>query>session и deeplink формат.
   Если в коде нет hashchange/resolveTarget — зафиксировать gap (это ожидаемо в текущей реализации).

---

## 9) Non-negotiable notes (anti-confusion)
- `activeIndex` — индекс в массиве results, 0-based, не id.
- `orderIndex` — позиционный индекс, не id.
- `textId/sentenceId` — stable ids, только они годятся для target/jump.
- scrollRestore сохраняется по ключу `<origin>:<type>`.
