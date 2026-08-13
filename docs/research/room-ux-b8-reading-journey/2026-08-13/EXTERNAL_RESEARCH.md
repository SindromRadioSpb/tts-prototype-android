# External research — B8 Reading Journey

Дата проверки: 2026-08-13. Ниже сначала наблюдение из первичного источника, затем отдельный вывод для LinguistPro. Это не копирование чужой IA.

## 1. Reading-product patterns

### Kindle

Наблюдение: Amazon описывает sync последней страницы, bookmarks, notes и highlights как серверный/cross-device контракт, требующий connectivity; furthest page read вынесена в отдельную синхронизируемую сущность. Источники: [Sync Your Kindle E-Reader](https://digprjsurvey.amazon.co.uk/csad/help/node/GGFEXXS8Z7DPJSTN?theme=light), [Sync Your Kindle Books](https://digprjsurvey.amazon.co.uk/csad/help/node/GDCAMDFMC2LZP6BR?theme=light).

Вывод: «Продолжить» должно иметь ясную authority и честный cloud label. Нельзя обещать Kindle-подобную cross-device семантику для Ben/Study, пока corpus artifacts намеренно не синхронизируются.

### Apple Books

Наблюдение: Apple разделяет auto-saved reading place и deliberate bookmark. В Library отдельно существуют Currently Reading, Want to Read и Finished; iCloud sync reading position/bookmarks/notes/highlights описан отдельно от library/collections. Источники: [Read books in Books on iPhone](https://support.apple.com/guide/iphone/read-books-iphc1af7c57/ios), [Access books on other Apple devices](https://support.apple.com/guide/ipad/access-books-on-other-apple-devices-ipad2150e566/ipados).

Вывод: saved work, passage bookmark, progress и finished — разные факты. В LinguistPro нельзя переиспользовать `bookmarks` как «Читать позже» или считать наличие My Text saved-state.

### Readwise Reader

Наблюдение: Reader документирует два положения для документа — furthest reading progress и last location — и offline работу для ранее открытых документов с последующей синхронизацией изменений. Отдельно документирована keyboard-first работа с highlight/tag/note. Источники: [Reader FAQ](https://docs.readwise.io/reader/docs/faqs), [Highlights, tags, and notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes).

Вывод: текущий `text_progress.last_row_idx` нельзя одновременно молча трактовать как furthest и exact last location. Immediate B8 сохраняет его как монотонный furthest/resume anchor; отдельный durable exact-last-location contract — только отдельным будущим решением.

### LingQ

Наблюдение: LingQ связывает word status, saved vocabulary и последующее review между Reader и vocabulary surfaces. Источник: [LingQ iOS App Support — Reader](https://www.lingq.com/en/ios-app-support/).

Вывод: заметка, manual word status и SRS должны композиционно встречаться в journey, но не сливаться в один writer. Существующие `notes_v2`, `note_occurrences`, `review_log` и `word_status` уже дают правильное разделение authority.

## 2. Web platform and accessibility

### Storage durability

Наблюдение: IndexedDB/OPFS по умолчанию относятся к best-effort storage; `navigator.storage.persist()` позволяет запросить persistent bucket, но браузер решает, будет ли запрос удовлетворён. При удалении site data данные всё равно исчезают. Источник: [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Вывод: «на этом устройстве» — обязательная честность для Ben/Study и localStorage reading lists. B8 может показать status/recovery affordance, но не имеет права заявлять backup без фактического export/cloud contract.

### History is presentation, not persistence

Наблюдение: `pushState/replaceState/popstate` управляют session-history entries; scroll restoration относится к traversal history. Источники: [MDN — History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API), [MDN — Working with the History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API), [MDN — History.scrollRestoration](https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration).

Вывод: B6 History restore остаётся presentation-only. Он может вернуть navigation context, но не заменяет LocalDb progress или cloud/backup recovery.

### WCAG 2.2 / keyboard / reflow / focus

Наблюдение: WCAG 2.2 требует keyboard operability, meaningful focus order, reflow без потери информации/функции, text-spacing resilience, focus visibility/not-obscured и minimum target size 24 CSS px с оговорёнными исключениями. Источники: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [Understanding Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), [Understanding Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).

Наблюдение: modal dialog должен удерживать focus, иметь доступное имя, поддерживать Escape и возвращать focus инициатору. Источник: [WAI-ARIA APG — Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Вывод: B8 acceptance обязана включать RU и HE/RTL, 200% как owner-requested gate, а automation дополнительно проверяет 320 CSS px reflow. Compact journey block должен сохранять DOM order = visual order; chips/filters не могут быть единственным неозвученным индикатором state.

## 3. Synthesized principles for B8

1. Auto progress, deliberate passage bookmark, saved work and finished are four separate facts.
2. A premium journey is recoverable because scope is explicit, not because every local fact называется cloud.
3. One UI may compose several canonical facts; one UI не должен создавать одну смешанную «journey truth».
4. Furthest position and exact last location are distinct semantics. Immediate B8 chooses one honestly instead of adding a second writer.
5. Offline-readiness needs both cached content and durable learner-state semantics; эти две оси нельзя смешивать.
6. Keyboard/AT semantics are part of the journey contract, not post-release visual polishing.
