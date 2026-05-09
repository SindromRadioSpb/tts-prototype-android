# Premium-концепт: Feedback & Contact Developer

> **Статус (2026-05-09):** MVP+ отгружен в `public/index.html` (commit `1f100a7`+ последующие fix'ы). Триаж, WhatsApp WOW-card с QR, 5 категорий, формы, diagnostics preview, 4-канальная отправка (WhatsApp / Email с device-routing / Copy / GitHub), persistent draft, dark theme, полная i18n (ru/en/he), inline cc-results, premium tooltip routing — всё работает.
> Mockup: `mockups/feedback-modal.html`.
>
> **Текущий roadmap по тирам:** Tier 1 + Tier 2 запланированы к реализации. Tier 3 — задокументирован, реализуется только при появлении реального user-signal.

## Цель

Создать единый контур обратной связи, который:
- закрывает все ключевые сценарии пользователя (баг, идея, вопрос, приватность, благодарность);
- ощущается **дороже** базовой email-формы за счёт продуманного UX и WhatsApp-интеграции с WOW-эффектом;
- защищает privacy-философию продукта (offline-first, никаких авто-beacon'ов);
- работает на все нагрузки — single-developer support, никакой команды.

---

## Принципы

1. **Один вход — много категорий.** Кнопка единственная, но за ней — структурированная триаж-панель.
2. **WhatsApp — primary канал.** Современный, мобильный, нативно поддерживает голос/фото/видео; русскоязычная аудитория предпочитает его email'у.
3. **Self-service первичен.** До формы — линки на docs, FAQ, common-fixes.
4. **Privacy-by-design.** Отправка чего-либо требует явного действия пользователя.
5. **Диагностика прозрачна.** Что прикрепляется — видно в preview, любой пункт можно убрать.
6. **Single source of truth.** Single developer = single inbox. Все каналы → один тред.
7. **Каждое сообщение — обещание.** "Читаю каждое, отвечаю в N часов" — и реально соблюдать.

---

## Информационная архитектура

```
[📬 кнопка в header]
    ↓
[Триаж-панель — 5 категорий + self-service блок]
    ↓
[WhatsApp WOW-card] ────────────┐
    или                         │
[Форма по категории]            │
    ↓                           │
[Diagnostics preview]           │
    ↓                           ↓
[Send: WhatsApp / Email / Copy / GitHub]
    ↓
[Acknowledgment screen]
```

---

## Layer 0 — Entry

- **Primary:** иконка `📬` в header IDE / classic mode, рядом с language selector. На mobile — в bottom-sheet menu.
- **Escape-hatch:** кнопка «Сообщить разработчику» на каждом error-toast (с pre-filled контекстом ошибки).
- **Status badge** в footer feedback-панели: 🟢 / 🟡 / 🔴 — текущий статус сервиса по `/api/diag`.

---

## Layer 1 — Триаж + Self-service

Структура:
1. **Self-service block** наверху (без него юзер сразу идёт в форму, разработчик тонет в дублях):
   - 📚 «Где живут мои данные» → `OPFS_USER_GUIDE.md`
   - ❓ FAQ (3 топ-вопроса)
   - 🔍 «Известные проблемы» → CHANGELOG / public roadmap
2. **WhatsApp WOW-card** (отдельный пункт ниже) — крупный, выделенный, главный CTA.
3. **5 категорий** карточками:
   - 🐛 Что-то не работает / баг
   - 💡 Идея / предложение
   - ❓ Не понимаю как сделать
   - 🛡️ Вопрос про приватность / данные
   - 🙏 Благодарность / отзыв
4. **Footer с другими каналами** (collapsed).

---

## WhatsApp интеграция — WOW-концепт

WhatsApp выбран как **primary** канал по причинам:
- Русскоязычная аудитория (основной target) предпочитает WhatsApp email'у.
- Нативная поддержка голосовых, фото, видео, документов — снижает порог "я не могу описать словами".
- End-to-end шифрование = соответствует privacy-философии продукта.
- Push-уведомления — разработчик видит в реальном времени.
- Mobile-first feel.

### WhatsApp WOW-card (главный визуальный акцент)

Дизайн:

```
╔══════════════════════════════════════════════╗
║  💬  Связаться через WhatsApp                ║
║                                              ║
║      🟢 Обычно отвечаю в течение 4 часов     ║
║                                              ║
║  ┌────────────────────┐  ┌────────────────┐ ║
║  │                    │  │                │ ║
║  │   [QR CODE]        │  │  [Открыть     ]│ ║
║  │                    │  │  [WhatsApp →  ]│ ║
║  │   Сканируйте       │  │                │ ║
║  │   с телефона       │  │  на этом      │ ║
║  │                    │  │  устройстве    │ ║
║  └────────────────────┘  └────────────────┘ ║
║                                              ║
║  💡 Можно отправить голосовое — это          ║
║     быстрее текста.                          ║
║                                              ║
║  🔒 Переписка end-to-end шифрована           ║
║     (стандарт WhatsApp).                     ║
║                                              ║
║  Быстрые шаблоны:                            ║
║   [🐛 Баг]  [💡 Идея]  [❓ Вопрос]            ║
╚══════════════════════════════════════════════╝
```

### Key WOW-элементы

1. **QR-код для desktop-юзеров.**
   QR encodes `https://wa.me/<phone>?text=<template>`. Юзер сканирует с телефона — открывается WhatsApp с pre-filled сообщением. **Полное превосходство над email**: на десктопе можно начать разговор, продолжить с телефона с привычной клавиатурой и нативными attachments.

2. **Smart device routing.**
   ```js
   function openWhatsApp(template) {
     const phone = '<configured>';
     const text = encodeURIComponent(template);
     // wa.me работает и на mobile (открывает app), и на desktop (web.whatsapp.com).
     window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
   }
   ```

3. **Pre-filled templates по категориям.**
   ```
   🐛 Bug template:
   "Привет! Нашёл баг в LinguistPro v3.0.0
   Что произошло: <курсор>
   ---
   Diagnostics: VFS=AccessHandlePool, OPFS=245MB/50GB, ..."

   💡 Idea template:
   "Привет! Идея для LinguistPro
   <курсор>"

   ❓ Question template:
   "Привет! Вопрос по LinguistPro
   <курсор>"
   ```

4. **Голосовая заметка — first-class hint.**
   Открытым текстом: «можно отправить голосовое». Это резко снижает порог входа для не-технических пользователей. Для emotion'ной обратной связи (благодарность) — естественнее голосом.

5. **Estimated response time с pulse-animation.**
   `🟢 Обычно отвечаю в течение 4 часов` — небольшая зелёная точка с CSS-pulse. Создаёт ощущение «живого» канала. Значение настраивается в коде, basis — реальные данные за прошлые недели.

6. **Privacy disclosure inline.**
   `🔒 Переписка end-to-end шифрована (стандарт WhatsApp).` — даёт юзеру уверенность, что выбор канала не противоречит privacy-стандарту продукта.

7. **Quick-templates ниже QR.**
   Три кнопки `[🐛 Баг] [💡 Идея] [❓ Вопрос]` — каждая открывает WhatsApp с под-template'ом. Юзер не пишет с нуля.

8. **Animated entrance.**
   Card появляется со scale-fade анимацией; QR — с lazy reveal после 200ms; статус-точка — с pulse. Это premium-feel.

---

## Layer 2 — Форма по категории (для тех, кто не использует WhatsApp)

Если юзер выбирает категорию вместо WhatsApp-card — открывается тематическая форма:

**🐛 Баг:**
- Что произошло (textarea, обязательно, markdown-preview)
- Что вы ожидали увидеть (textarea, опционально)
- Шаги воспроизведения (textarea с auto-numbering 1./2./3.)
- Скриншот (drag-drop / paste / file picker)
- ✅ Прикрепить диагностику (toggle, default ON)

**💡 Идея:**
- Краткое описание (input)
- Подробнее (textarea, markdown)
- Какую проблему это решает (textarea)
- Без диагностики (default OFF)

**❓ Вопрос:**
- Что вы пытаетесь сделать (textarea)
- Что не получается (textarea)
- ✅ Прикрепить диагностику (default OFF)

**🛡️ Приватность:**
- Что беспокоит (textarea)
- Кнопка «Удалить все мои данные» → запускает wipe-all
- Кнопка «Скачать ZIP-бэкап» → запускает export
- При отправке — auto-link на OPFS_USER_GUIDE

**🙏 Благодарность:**
- Свободная форма (textarea)
- ✅ «Можно публиковать как testimonial» (default OFF, opt-in)
- Hint: «можно отправить голосовое в WhatsApp — будет быстрее»

---

## Layer 3 — Diagnostics preview

Если diagnostics toggle ON — перед отправкой показываем **точно** что прикрепится:

```
К отчёту прикрепится:

▼ App                                    [×]
  linguistpro 3.0.0

▼ Browser & OS                           [×]
  Chrome 132.0 / Windows 11
  Screen: 1920×1080, DPR 1.5

▼ Storage (OPFS)                         [×]
  VFS: AccessHandlePool
  Used: 245 MB / 50 GB (0.5%)
  Texts: 47, Sentences: 1430, Notes: 89

▼ Telemetry (последние 10 событий)       [×]
  2026-05-08 14:32  init.success         (245ms, AccessHandlePool)
  2026-05-08 14:32  integrity.ok         (87ms)
  ...

▼ Recent console errors (3)              [×]
  ...

❌ Любой пункт можно убрать. Содержимого
   ваших текстов / заметок никогда нет в
   автоматической диагностике.
```

Каждая секция collapsible. Каждую можно убрать чекбоксом. **Содержимого библиотеки никогда нет в авто-диагностике** — только counts/metadata.

---

## Layer 4 — Send

Четыре способа отправки в порядке убывания premium-feel:

1. **💬 WhatsApp** (primary). Открывает мобильное app или web.whatsapp.com с pre-filled сообщением + diagnostics в виде текста.
2. **📧 Email** (secondary). `mailto:` с rich text body. Для тех, у кого нет WhatsApp или предпочитают email.
3. **📋 Copy to clipboard** (tertiary). Копирует диагностику + текст + email-куда-отправить. Для extreme cases.
4. **🐙 GitHub Issue** (advanced). Pre-filled issue page с template'ом — для технических багов с публичным треком.

---

## Layer 5 — Acknowledgment

```
✓ Спасибо!

Читаю каждое сообщение лично — отвечу в
течение 4 часов в будни (по Москве).

Если срочно — напишите в WhatsApp,
там я вижу уведомления быстрее.

🎯 Что вы можете сделать сейчас:
  • Продолжить работу — приложение
    работает оффлайн.
  • Сделать ZIP-бэкап на случай если
    проблема разовьётся.
  • Включить уведомления о новых версиях.
```

---

## Persistent draft

Любая форма автосохраняется в `localStorage.feedbackDraft_v1` каждые 2 секунды. Если юзер случайно закрыл — при следующем открытии модалки видит «У вас есть несохранённый черновик [восстановить]». **Никогда не терять чужой текст** — premium baseline.

---

## Каналы связи (collapsed footer)

```
┌────────────────────────────────────────────────┐
│ 💬 WhatsApp        wa.me/<phone>     [QR]      │
│ 📧 Email           sindromradiospb@…           │
│ 🐙 GitHub          /SindromRadioSpb/…          │
│ 📚 Документация    /docs/OPFS_USER_GUIDE       │
│ 🔔 Changelog       /CHANGELOG.md               │
│ 🛡️ Privacy         в guide раздел Privacy      │
└────────────────────────────────────────────────┘
```

---

## Premium-touches которые поднимают концепт выше базового

1. **Smart suggestions при заполнении.** Fuzzy-search по changelog/known-issues подсказывает «Возможно вы столкнулись с этим: ...». Снижает дубль-репорты.
2. **Шаблоны в textarea.** Кнопки «Шаги ▾» / «Окружение ▾» вставляют heading в markdown.
3. **Reproduction recorder** (advanced/опц.). Кнопка «Записать действия» — стартует rrweb-style запись на 30 секунд.
4. **Голосовая заметка** (mobile-friendly). Кнопка 🎤 — записать 30с audio. **Также подсказка использовать voice в WhatsApp** для пользователей, которым проще говорить.
5. **Auto-fill last error.** Если юзер только что видел error-toast — pre-filled "Я только что увидел: <текст ошибки>".
6. **Status badge.** Real-time из `/api/diag`: 🟢 / 🟡 / 🔴.
7. **Public roadmap link.** В категории «Идея» — ссылка на roadmap. Прозрачность.
8. **Acknowledgment с реальным timestamp.** «Получено 14:32, ответ ожидайте до 18:32 (4 часа)».
9. **Tip-jar опция.** В категории «Благодарность» — деликатная ссылка на Patreon/Boosty/BMC.
10. **Локализация формы.** EN/HE — форма на их языке, разработчик видит языковой тег в subject.
11. **WhatsApp animated QR fade-in.** При открытии card'a QR анимированно появляется (0→100% opacity over 400ms, scale 0.95→1.0). Создаёт «магический» feel.

---

## Что закрывает «массив широких проблем»

| Проблема юзера | Решение в концепте |
|---|---|
| «Сломалось — что делать» | Escape-hatch на toast → форма с auto-context |
| «Не нашёл фичу» | Self-service block + категория «Не понимаю» |
| «Боюсь за данные» | Категория «Приватность» + panic ZIP-backup кнопка |
| «Нашёл идею» | Категория «Идея» + roadmap link |
| «Хочу поблагодарить» | Категория «Благодарность» + tip-jar опция |
| «Не доверяю что данные не утекут» | Diagnostics preview + opt-out per item |
| «Случайно закрыл — текст потерян» | Persistent draft в localStorage |
| «Не успел сделать скриншот» | Reproduction recorder / auto-attach last error |
| «Не уверен баг это или я что-то делаю не так» | Smart suggestions + FAQ self-service |
| «Хочу удалить себя из системы» | В категории «Приватность» — wipe-all + ZIP export |
| «Не люблю писать письма» | **WhatsApp** + voice note + QR для desktop |
| «Хочу быстрого ответа» | Estimated response time + WhatsApp push'и приходят сразу |
| «Не хочу регистрироваться чтобы написать» | WhatsApp = no signup, у всех уже стоит |

---

## Дополнительные команды в feedback-модалке

Помимо самой формы, в этой же модалке стоит вынести (закрывает «massiv широких проблем»):

1. **«Сделать ZIP-бэкап сейчас»** — большая кнопка, видимая на каждой категории.
2. **«Проверить целостность БД»** — ручной запуск `integrityCheck()`.
3. **«Мои telemetry»** — view последних 50 событий (`v3OpfsTelemetry.list()`).
4. **«Storage estimate»** — текущий quota usage с CTA «освободить место».
5. **«Перейти на сервер» / «Вернуться к localMode»** — kill-switch state visible.

Это превращает feedback-модалку в **command center** для всего, что связано со здоровьем приложения.

---

## Implementation effort estimate

- **MVP (Tier 1):** ~3 дня — кнопка, триаж, 3 категории (баг/идея/вопрос), WhatsApp WOW-card с QR, diagnostics preview, mailto-send, persistent draft.
- **Tier 2:** +2 дня — категории «Приватность»/«Благодарность», channels footer, acknowledgment screen, escape-hatch на toast, status badge, WhatsApp templates.
- **Tier 3 (advanced):** +3-5 дней — reproduction recorder, voice note (in-app), smart suggestions, public roadmap integration, tip-jar.

Итого: **~1 неделя** на полнометражный premium-концепт; **3 дня** на MVP, который уже превосходит большинство OSS-аналогов.

---

## Технические зависимости

- **QR-код:** `qrcode-generator` (~3 KB, no deps) или inline SVG для статичного QR. **Не использовать** внешние API типа qrserver.com — это противоречит offline-first философии.
- **WhatsApp deep-link:** только `https://wa.me/<phone>?text=<urlencoded>`. Работает кросс-платформенно.
- **Phone number:** конфигурируется в `/api/client-config` (или env `DEVELOPER_WHATSAPP_PHONE`), чтобы менять без app-deploy.
- **Markdown в textarea:** уже есть `marked.js` помеченный для C7 — переиспользовать.
- **Persistent draft:** `localStorage.feedbackDraft_v1`, throttled save.

---

## Recommended rollout

**Фаза 1 (после C5 RTL и C1 FTS5):** MVP — закрывает 80% сценариев. WhatsApp WOW-card сразу в первой версии (это главная визуальная фишка).

**Фаза 2 (когда наберётся 50+ репортов):** добавить smart suggestions из реальных категорий.

**Фаза 3:** advanced features по фактическому запросу пользователей.

---

## Tier-разбивка для пост-MVP iteration (2026-05-09)

После shipping'а MVP+ концепт разбит на три уровня по приоритету. Tier 1 и Tier 2 утверждены к реализации сейчас. Tier 3 задокументирован для возврата при появлении сигнала.

### Tier 1 — критические пробелы для «премиум-завершённости»

Закрывают обещания концепта по MVP+. Без них окно ощущается «почти готовым», но не «готовым».

| # | Задача | Эффект | Оценка |
|---|--------|--------|--------|
| 1.1 | **Реальный FAQ-блок.** Заменить `alert("FAQ — TBD")` на in-modal accordion с 3 реальными вопросами (где данные / как сделать резерв / что значат маркеры). | Снижает поток duplicate-вопросов на 30-50%. | 0.5 дня |
| 1.2 | **Escape-hatch на error-toast'ах.** Расширить `showToast(msg, kind, opts)`: при `kind="error"` добавлять кнопку «📬 Сообщить» которая открывает feedback с pre-filled error context. Track последних 5 ошибок в global ring buffer. | Ловит баги в момент сильнейшей мотивации юзера. Кратно больше репортов. | 0.5 дня |
| 1.3 | **Auto-fill last error в bug-форме.** Если за последние 60 секунд был error-toast — bug-form pre-filled `Я только что увидел: <текст>`. Связано с 1.2. | Снижает trigger-friction для bug-репортов. | 0.25 дня |
| 1.4 | **Клавиатура и focus trap.** Auto-focus на первом textarea при открытии формы, `Ctrl/Cmd+Enter` → отправка через WhatsApp (primary), focus trap (Tab не уходит из модалки), `Esc` уже есть. | Premium baseline доступности; power-user UX. | 0.25 дня |
| 1.5 | **Acknowledgment с реальным timestamp.** Показать реальное время отправки + расчёт SLA («Получено 14:32, ответ до 18:32 — в течение 4 ч»). | Создаёт ощущение SLA, повышает trust. | 0.25 дня |
| 1.6 | **Reduced-motion respect.** `@media (prefers-reduced-motion: reduce)` отключает entrance/pulse/QR-fade анимации. | A11y standard; респект к пользовательским preferences. | 0.25 дня |

**Tier 1 итого:** ~2 дня. После этого окно закрывает все обещания концепта по MVP+.

### Tier 2 — premium-полировка

Полировка ощущений «все мелочи продуманы». Не критично, но добавляет premium-feel.

| # | Задача | Эффект | Оценка |
|---|--------|--------|--------|
| 2.1 | **История отправленных feedback'ов локально.** `localStorage.feedbackHistory_v1` (max 20). Кнопка «Мои предыдущие обращения» показывает список — копировать или переотправить. | Премиум-функция; полезно для «я уже это писал, что я тогда сказал?» | 0.5 дня |
| 2.2 | **Char counter в textarea.** Маленький `123 / 2000` в углу. | Полезно для длинных сообщений в WhatsApp. | 0.25 дня |
| 2.3 | **Loading skeletons.** Заменить плейсхолдер `QR…` на анимированный skeleton. То же для config-fetch. | Меньше «мигания», ощущение загрузки. | 0.5 дня |
| 2.4 | **Periodic status-badge refresh.** Каждые 30 секунд пока модалка открыта. | Реальное состояние сервиса в момент когда юзер пишет. | 0.25 дня |
| 2.5 | **Copy-button в diagnostics preview.** «📋 Скопировать диагностику» отдельно — для тех, кто хочет вставить только diag. | Power-user UX. | 0.25 дня |
| 2.6 | **Public roadmap link в категории «Идея».** Ссылка на `GitHub Issues?label=enhancement` — informal roadmap. | Прозрачность; юзер видит «уже учтено». | 0.25 дня |
| 2.7 | **Markdown preview на bug-форме.** Toggle Edit/Preview для тела bug-репорта. Использует существующий `v3NotesMdToSafeHtml`. | Полезно для код-блоков и списков. | 0.5 дня |
| 2.8 | **Mobile drawer-style.** Bottom-sheet что выезжает снизу + sticky header. Замена текущего модала на mobile. | Native-like тач-UX. | 0.5 дня |
| 2.9 | **WhatsApp confirmation на desktop.** Маленький preview перед `window.open` («Откроется WhatsApp Web»). | Меньше неожиданных tab'ов. | 0.1 дня |
| 2.10 | **Tip-jar stub в категории «Благодарность».** Заглушка «Если хотите поддержать материально: скоро здесь будет ссылка». Полная реализация — когда у разработчика будет Patreon/Boosty/BMC. | Мост к будущей фиче. | 0.25 дня |

**Tier 2 итого:** ~3 дня. Ощущение «все мелочи продуманы».

### Tier 3 — advanced (концепт Tier 3 + future)

Задокументированы; реализуются **только при появлении реального user-signal** или когда другие приоритеты закрыты.

| # | Задача | Когда делать | Оценка |
|---|--------|--------------|--------|
| 3.1 | **Reproduction recorder (rrweb).** Запись 30-секунды действий → прикрепляется к bug-репорту. | Когда появятся технические баги, которые сложно описать словами. | 2-3 дня + ~30KB lib |
| 3.2 | **In-app voice notes.** Кнопка `🎤` записывает 30с audio → отправляется в WhatsApp как файл. | Когда соберём данные что юзеры предпочитают voice. | 2 дня |
| 3.3 | **Smart suggestions из real submissions.** После 50+ репортов — fuzzy-search по changelog/known-issues. | Когда есть реальные данные. | 1 день |
| 3.4 | **Reaction recorder (light alternative to rrweb).** Координаты mouse/tap + viewport state в JSON. | Альтернатива 3.1, если rrweb тяжёл. | 1.5 дня |
| 3.5 | **Screenshot attachment via Clipboard API.** `navigator.clipboard.read()` после Print Screen → preview в форме. | Когда HTTPS + permissions stable. | 1 день |
| 3.6 | **Onboarding tour.** First-time spotlight на feedback-модалку. | Когда наберётся достаточная новизна юзеров. | 1 день |
| 3.7 | **Multi-step bug categorization.** Сначала «Где?» (TTS / Library / SRS / IDE / Mobile) → потом «Что?» с tag в title. | Когда репортов станет много и нужна автокатегоризация. | 0.5 дня |
| 3.8 | **Severity selector для багов.** Radio: blocker / major / minor / trivial. | Когда нужна приоритизация. | 0.25 дня |
| 3.9 | **Full accessibility pass.** aria-live cc-results, aria-current view, focus trap (полный, не частичный из 1.4), high-contrast mode. | Перед публичным релизом / app-store submission. | 1-1.5 дня |
| 3.10 | **Animated view transitions.** View Transition API для triage→category→ack. | Когда таргет-браузеры поддержат стабильно. | 0.5 дня |

**Tier 3 итого:** 10-12 дней суммарно. Реализуется по запросу.

---

## Связь с другими частями продукта

- После реализации заменяет существующее `alert()`/`confirm()` для destructive ops единым feedback-flow при ошибках.
- Дополняет D5 kill-switch: при активации — feedback-кнопка автоматически открывается с подсказкой «Сейчас режим обслуживания, но вы можете писать».
- Связан с B5 telemetry: diagnostics preview = форматированный вывод `v3OpfsTelemetry.summary()`.
- Дополняет D1 user guide: ссылки на `OPFS_USER_GUIDE.md` встроены в self-service block.
