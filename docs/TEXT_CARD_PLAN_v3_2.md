# Text-card System — v3.2.0 Direction 10

> **Цель.** Внедрить полный жизненный цикл text-card как премиум-артефакта: **создание (Mode A) → распространение (Mode B) → опциональная курация (Mode C)**.
>
> **Принцип.** Не «кнопка отправить разработчику», а **трёхмодальная система**, в которой 99% кейсов решает self-service builder, peer-sharing работает мгновенно через content-addressed audio cache, а curator-mediated review — для cases, где нужен human verification.
>
> **Baseline.** v3.1.0 (premium polish complete: PWA, i18n, theming, smart-sort, error gentleness, trust signals).
>
> **Что НЕ входит в этот Direction.** Server-side TTL share-cache (короткие public URLs) — defer в v3.3 как separate premium sharing epic. End-to-end encryption на share — defer в v3.3. Received-cards inbox — defer в v3.3.

---

## 1. Decisions log (утверждено пользователем 2026-05-10)

| # | Решение | Обоснование |
|---|---------|-------------|
| D1 | **v3.2 ships without new server-side share endpoints.** Mode B uses file-based sharing: lightweight JSON и optional full ZIP с audio. Server-side TTL share-cache с короткими public URLs deferred в v3.3 как separate premium sharing epic. | Foundation важнее UX-upgrade'а. Сначала надёжный жизненный цикл «создать → сохранить → поделиться файлом → импортировать → восстановить аудио», потом short-link UX. |
| D2 | **Mode C uses Standard vs Curated split.** Standard requests **не идут разработчику** — redirect в Mode A с pre-filled content. Curated requests идут через feedback/WhatsApp channel для human review и возвращаются как standard importable ZIP bundle. | Standard handler автоматически решает 99% кейсов; нет смысла создавать manual bottleneck. Curated branch нужен только там, где требуется human verification (учитель ulpan'а, специализированные тексты). Только-Curated подход сделал бы продукт зависимым от ручного сервиса — плохо масштабируется. |
| D3 | **Mode A bulk limit = 10 текстов** в одном batch для v3.2. | Premium ≠ unlimited; premium = predictable + stable + controlled. 10 — разумный предел для первого production-релиза. Можно поднять в v3.3 после dogfood. |
| D4 | **Mode B defaults to lightweight text-card JSON без embedded audio.** Audio восстанавливается на стороне receiver'а через content-addressed `audio_asset_key` resolution. Full ZIP с embedded MP3 остаётся доступным как explicit offline/export опция. | Самое элегантное архитектурное решение: одинаковый `asset_key` → одна и та же MP3 на любом устройстве. Receiver получает identical audio без re-synthesis, без quota burn. Lightweight JSON — обычно ≤ 50 KB, мгновенно отправляется через любой channel. |
| D5 | **Direction 10 ships Mode A + Mode B + Mode C together в v3.2.** Mode B не откладывается. | Mode B — prerequisite для ulpan group deployment (Direction 11) и diploma research scenarios. Без него: каждый студент сам вставляет текст, разные результаты, разное аудио, разное качество — несовместимо с групповым экспериментом. A+B+C вместе — полноценная образовательная инфраструктура (создание → распространение → улучшение качества). |

---

## 2. Стратегическое позиционирование

### Архитектурный insight, который всё меняет

Audio-cache сервера — **content-addressed**: `asset_key = sha256({text, voice, rate, pitch})`. Один и тот же иврит-текст с одной и той же TTS-конфигурацией → один и тот же `asset_key` на любом устройстве, одна и та же MP3 на сервере.

**Это значит:**
- Text-card-артефакт не должен содержать MP3-файлы — достаточно `asset_key`-references; receiver-устройство восстанавливает звук через общий cache.
- Card маленький (десятки KB JSON), пересылаем через любой channel — WhatsApp, email, file drop.
- Receiver получает **identical** audio (тот же голос, скорость, произношение) что sender — без re-synthesis, без quota burn.

**Это premium-преимущество, которое не использует никто из конкурентов** — ни Anki Shared Decks, ни Quizlet, ни LingQ, ни Reverso.

### Конкурентное позиционирование

| Возможность | Anki Shared | Quizlet | LingQ | Reverso | **LinguistPro Text-card** |
|-------------|:-----------:|:-------:|:-----:|:-------:|:-------------------------:|
| Bulk import | ✗ | ✗ | partial | ✗ | **✓ Mode A** |
| Peer-share via file | partial (`.apkg`) | ✗ (cloud-only) | ✗ | ✗ | **✓ Mode B** |
| **Audio survives sharing** | ✗ (re-record) | ✗ | ✗ | ✗ | **✓ via content-addressed cache** |
| Verified content (curator) | community | community | community | ✗ | **✓ Mode C** |
| Hebrew morphology in shared | ✗ | ✗ | ✗ | ✗ | **✓ (via Direction 9 sentence-bound notes)** |
| Offline-first (no account) | partial | ✗ | ✗ | ✗ | **✓** |

### Ключевое сообщение

*«Text-card в LinguistPro — это полный жизненный цикл: создай pack за минуту, поделись одним файлом, получи verified-version от куратора. Аудио переживает sharing — никто из конкурентов этого не умеет.»*

---

## 3. Mode A — Bulk text-card builder (self-serve)

### Use case

«У меня 5 текстов из ulpan'а на эту неделю — обработай все сразу, сохрани в библиотеку, дай мне ZIP для backup'а».

### Entry point

- Кнопка **«📦 Новая text-card»** в Library toolbar.
- Вторичный entry: меню «Bulk import» в About modal.
- Из Mode C Standard branch — redirect с pre-filled content.

### UX flow

1. Modal открывается с большой textarea для иврита.
2. **«+ Добавить ещё текст»** — поддержка до **10 параллельных текстов** в одном batch (D3).
3. Per-text fields:
   - **Title** (auto-extract из первой строки если пусто)
   - **Source** (URL, "Ulpan week 5", свободный текст)
   - **Level** (beginner / intermediate / advanced)
   - **TTS profile** (voice / speed / pitch — с дефолтом из user settings)
   - **Tags** (опционально — например `homework`, `ulpan`)
4. **Pre-flight estimate** перед стартом:
   - Total rows estimate: ~30 rows / text × N texts
   - TTS quota cost estimate: ~30 rows × N texts × 50 chars avg = X chars
   - Translation API calls: N
   - Audio prefetch concurrency: 6 parallel
   - Estimated time to complete: minutes
   - Confirm button: «Build N cards (estimated ~T min, ~Q TTS chars)».
5. CTA **«Build cards»** → starts pipeline.
6. **Progress UI:**
   - Per-text spinner + status: `Translating…` / `Generating audio (45/120 rows)` / `✓ Done`
   - Aggregate progress bar
   - Modal can be minimized; pipeline continues в background.
7. **Done state — три actions:**
   - **💾 Сохранить в библиотеку** (default) — все тексты добавляются как обычные library-тексты через existing `saveText` flow.
   - **📥 Скачать ZIP** — генерируется `text-card-bundle.zip` (subset of library bundle, только эти тексты) через `exportBundle({textIds: [...]})`.
   - **🔗 Поделиться** — переход в Mode B (share-flow) для одной выбранной card.

### Architecture

- **Никаких новых endpoint'ов.** Reuse `/api/translate-table-v2` + `/api/audio/prefetch/start`.
- Frontend orchestrator: `v3TextCardBuilder` управляет multi-text queue (FIFO с retry на 429 — exponential backoff).
- State persisted в OPFS (`text_card_jobs` table): job survives modal close / page reload / network blip.
- Existing `exportBundle({textIds})` уже умеет subset-export — переиспользуем.

### Edge cases / mitigations

| Edge case | Mitigation |
|-----------|-----------|
| **Quota burn** — 10 текстов × 30 строк × premium TTS = существенный расход | Pre-flight estimate с явной confirmation. User видит estimate ДО старта. |
| **Long-running** — обработка может занять > 5 минут | Pipeline idempotent через OPFS state. Закрытый modal → re-opened → видит progress правильно. |
| **Partial failure** — 3-й текст упал на translate API | Retry-button per текст; не abort'ит весь batch. |
| **Concurrent user actions** — user открыл другой текст, audio playback | Builder background-mode не блокирует foreground — separate queue, separate progress. |
| **Network drop mid-batch** | Pause + resume через OPFS state + retry on reconnect. |

### Acceptance criteria

- [ ] Modal открывается ≤ 200ms.
- [ ] Pre-flight estimate accurate within ±20% of actual.
- [ ] 10-text batch на typical homework set (~30 rows / text) completes within 8 minutes.
- [ ] Pipeline survives modal close + reopen без loss progress.
- [ ] Partial failure retry preserves successful texts.
- [ ] Save-to-library + download-ZIP + share — все три actions функциональны.

---

## 4. Mode B — Text-card share (peer-to-peer)

### Use case

«Учитель ulpan'а сделал card → отправил всем студентам group chat → студенты импортировали → все работают с identical material».

«Друг → друг»: «Прикольная песня, обработал — на, держи».

### Entry point

- Кнопка **«🔗 Поделиться»** в Library card actions row (рядом с edit/delete/archive).
- Из Mode A done-state — share-flow для одной выбранной card.
- Из Text Meta Edit modal — secondary entry.

### UX flow для sender'а

1. Click «Поделиться» на тексте в библиотеке.
2. Modal opens с card preview:
   - Title + summary (rows count, audio status)
   - Three options (D4):
     - **«📤 Поделиться карточкой»** (default) — system share-sheet с lightweight JSON file attachment.
     - **«📥 Скачать JSON»** — вручную скачать lightweight `text-card-<slug>.json`.
     - **«📦 Скачать ZIP с аудио»** — full bundle (для receiver'ов offline / без сервера).
3. **Info banner:** «Обычная карточка маленькая и быстро отправляется. Аудио будет восстановлено у получателя из общего кэша при первом воспроизведении. Если получатель будет offline или не подключен к этому серверу — выберите 'Скачать ZIP с аудио'.»
4. На mobile: «📤 Поделиться» открывает native share-sheet (WhatsApp / Telegram / Email / Files / etc.) с file attachment.
5. На desktop: «📤 Поделиться» предлагает скачать файл + опцию «Открыть WhatsApp Web» (preset message с просьбой прикрепить downloaded файл).

### UX flow для receiver'а

1. Receiver получает файл (через WhatsApp file-attachment / email attachment / drag-drop в Library).
2. App detects:
   - File extension `.json` + magic header → text-card lightweight format.
   - File extension `.zip` → full bundle (existing import path).
3. Preview-modal opens:
   - Title + first few rows preview
   - Source attribution (если sender указал в `source`)
   - Audio status: «Аудио будет загружено из общего кэша (≤ T seconds)» / «Аудио включено в файл (full ZIP)»
   - **«Импортировать»** primary CTA
   - Optional checkbox: **«Pre-load audio»** (рекомендуется для bulk consumption — pre-fetch все MP3 до первого play)
4. Click «Import» — текст добавляется в библиотеку через existing `importBundle` (или адаптер для lightweight format).
5. Audio resolution:
   - Eager (если pre-load checkbox): app проходится по всем `audio_asset_key` и pre-fetches MP3 from Railway cache → OPFS.
   - Lazy (default): MP3 fetches при первом play row'a. Cache miss → re-synthesizes через `/api/tts` (sender-side audio profile + plain text → identical asset_key).

### Format `text-card-v1` (lightweight JSON, ~10–50 KB)

```json
{
  "format": "linguistpro-text-card-v1",
  "exported_at": "2026-05-10T12:34:56.789Z",
  "exported_by_app": "linguist-pro-web/3.2.0",
  "card": {
    "title": "Песня 'Шалом, Хавер'",
    "level": "intermediate",
    "tags": ["song", "ulpan-week-5"],
    "source_label": "Ulpan курс, неделя 5",
    "topic": null,
    "source_text": "...full Hebrew text...",
    "rows": [
      {
        "row_id": "uuid-stable-per-row",
        "order_index": 0,
        "hebrew_plain": "שלום חבר",
        "hebrew_niqqud": "שָׁלוֹם חָבֵר",
        "translit": "shalom haver",
        "translit_ru": "шалом хавер",
        "russian": "Здравствуй, друг",
        "audio_asset_key": "sha256-...",
        "edit_meta": null,
        "note": null
      }
    ],
    "tts_profile": { "voice": "he-IL-Wavenet-A", "rate": 1.0, "pitch": 0.0, "language": "he-IL" },
    "text_audio_asset_key": null
  }
}
```

**Совместимость с library/library.json shape:** `card.rows` совпадает по schema'е с `text.rows` в bundle export. `card` это просто single-text subset of `library.texts`. Адаптер `importTextCard(json)` дегенерирует в bundle-shape и feed'ит в существующий `importBundle()`.

### Audio resolution на receiver-side

```
on_row_play(row):
  asset_key = row.audio_asset_key
  if asset_key in OPFS audio_cache:
    play(local_mp3)
    return
  fetch /api/audio/<asset_key> from Railway:
    if 200:
      cache to OPFS
      play(downloaded_mp3)
    elif 404 (cache miss):
      // Last resort: re-synthesize on the fly
      mp3 = POST /api/tts {text: row.hebrew_plain, voice/rate/pitch from card.tts_profile}
      // Same parameters → identical asset_key returned by /api/tts response
      cache to OPFS keyed by asset_key
      play(mp3)
```

Re-synthesis на receiver-side — fallback, не должно происходить в normal flow если sender и receiver используют один Railway production-инстанс. Cost для user: одна extra TTS call per missing row (rare).

### Privacy properties

- В файле — только текст + asset_keys + metadata. **Никакой user identity.**
- Receiver не знает, кто sender (если sender сам не подписался в `source_label`).
- Audio cache на Railway — content-addressed, **no user attribution.**
- File size ≤ 50 KB для типичной card → можно отправлять через любой channel без сжатия.

### Edge cases

| Edge case | Mitigation |
|-----------|-----------|
| **Receiver offline когда импортирует lightweight JSON** | Import succeeds; rows показываются без audio; play row → friendly toast «Audio будет загружен при подключении». На reconnect — auto-fetch missing assets. |
| **Sender использовал custom TTS profile, receiver — другой Railway-инстанс** | Re-synthesis на receiver через `/api/tts` (cache miss path) — identical asset_key восстанавливается из cache miss. Один extra TTS call per row. |
| **Card содержит advanced notes (audio-anchored, templated)** | По default — не включаются (consistent с Direction 9 D2 bundle compat policy). Future: opt-in «include my advanced notes» в share modal. |
| **Card был отредактирован после share, sender видит «расходящиеся версии»** | Out of scope для v3.2 — share — это **snapshot**, не living link. v3.3 short-link share-cache добавит versioning. |
| **Maliciously crafted card** (XSS in `source_text`?) | Existing import flow уже sanitizes; добавить explicit validation на text-card-v1 schema перед import. |

### Acceptance criteria

- [ ] Lightweight JSON file size ≤ 50 KB для card до 100 rows.
- [ ] Share-modal три option работают на mobile + desktop.
- [ ] Receiver import preview показывает correct rows + audio status.
- [ ] Pre-load audio (eager) — completes within ≤ 30s для 30-row card.
- [ ] Lazy audio fetch — first play ≤ 2s after click для cache hit.
- [ ] Cache-miss re-synthesis — first play ≤ 5s after click.
- [ ] Full ZIP variant (с MP3) — backwards-compatible с existing `importBundle`.

---

## 5. Mode C — Curated request (developer-mediated)

### Use case

- **Учитель ulpan'а** — еженедельный text для класса; нужен verified niqqud + конкретный voice + правильная идиоматическая интерпретация.
- **Студент со сложным текстом** — стихи, классика, специализированный жаргон, где auto-pipeline промахивается.
- **Native speaker** хочет vetting auto-output для собственного материала.

### Entry point

Feedback modal → новая категория **«📦 Заявка на text-card»** (рядом с Bug / Idea / Question / Privacy / Thanks).

### UX flow

1. User открывает Feedback → выбирает «Заявка на text-card».
2. Form fields:
   - **Hebrew text** (textarea, до 50 KB)
   - **Контекст** (optional): «Откуда текст», «Зачем нужна обработка», «Specific concerns» (e.g. niqqud, идиоматика).
   - **Quality level** (radio):
     - **Standard** (auto-pipeline) — fast, free, by default redirects в Mode A
     - **Curated** (human review) — slower, requires WhatsApp/email exchange
   - **Preferred voice / pace** (только если Curated)
   - **Return channel** (только если Curated): WhatsApp / Email
3. **Submission paths (D2):**
   - **Standard branch:** app **не отправляет developer'у**. Closes feedback modal. Opens Mode A с pre-filled content (Hebrew text + voice/pace settings → автоматически filled). User проходит обычный self-service flow.
   - **Curated branch:** WhatsApp message to developer с metadata: `[LinguistPro Card Request] Quality: curated | Voice: ... | Return: WhatsApp/Email | Text: <первые 200 chars>...` (полный текст в attachment).
4. **Tracking:** requests хранятся в `localStorage.textCardRequests_v1` (как feedback history) — user видит status:
   - `📤 Sent {date}` (just submitted)
   - `📨 Received {date}` (developer прислал ZIP)
   - `📥 Imported {date}` (user импортировал в library)
5. **Return ZIP** — стандартный bundle, импортируется через existing import flow (Library → Import).

### Why Standard branch redirects to Mode A (D2)

- 99% запросов не нуждаются в human review.
- Mode A решает быстрее (минуты vs часы–дни) и дешевле (no human bottleneck).
- Developer получает только то, что **реально требует** verification — фокус.

### Why Curated branch остаётся

- **Premium signal:** «у тебя есть человек, к которому можно обратиться» — это редкость в edu-software.
- **Ulpan integration:** учитель Curated branch использует для еженедельного homework distribution.
- **Quality ceiling:** auto-pipeline хорош, но не perfect — для критичных текстов нужен human.

### Architecture

- Extend existing feedback modal с новой категорией (small change).
- WhatsApp template: `feedback.cardRequestTpl` i18n key.
- Standard branch: `v3FbCardRequestRedirectToBuilder(textBody, voicePreference)` — opens Mode A с pre-filled.
- Curated branch: existing WhatsApp deep-link mechanism.
- Returned ZIP — стандартный bundle, импортируется через existing `importBundle()`.

### Acceptance criteria

- [ ] New category «📦 Заявка на text-card» visible в feedback modal.
- [ ] Standard branch redirects в Mode A с pre-filled content (Hebrew text + voice/pace).
- [ ] Curated branch generates correct WhatsApp deep-link с full text attachment.
- [ ] Request history visible в feedback modal history panel.
- [ ] Status tracking: sent / received / imported visible per request.
- [ ] All 3 locales (ru/en/he) cover new strings.

---

## 6. Архитектурное воздействие

### Новых server endpoint'ов — **ноль** (D1)

Для v3.2 **не добавляем** ни одного нового server endpoint:
- Mode A: reuses `/api/translate-table-v2` + `/api/audio/prefetch/start` + `/api/audio/<asset_key>` + `/api/tts`.
- Mode B: file-based; receiver fetches audio через existing `/api/audio/<asset_key>`.
- Mode C: feedback channel — клиентский WhatsApp deep-link, server не участвует.

**Что defer'нуто в v3.3:**
- `POST /api/share/text-card` — accept JSON, return shareable URL with TTL.
- `GET /api/share/text-card/:id` — fetch cached share JSON.
- Railway TTL share-cache storage с 30-day retention.
- Optional E2E encryption для private share (URL-fragment key).

### Новые UI-поверхности

- **Modal `v3TextCardBuilderModal`** (Mode A) — большой
- **Modal `v3TextCardShareModal`** (Mode B) — средний
- **Modal `v3TextCardImportPreview`** (Mode B receiver) — средний
- **Feedback category extension** (Mode C) — малый
- **Library card action button «🔗 Share»** (entry point Mode B) — малый

### Новые data-структуры

OPFS — **никаких новых таблиц для v3.2**:
- `text_card_jobs` table — opt-in (для Mode A pipeline persistence). Можно начать с in-memory + localStorage и promote в OPFS table если нужно.

LocalStorage:
- `text_card_jobs_v1` — Mode A in-flight jobs state (persist через page reload).
- `textCardRequests_v1` — Mode C history (mirror feedbackHistory_v1 pattern).
- `textCardImports_v1` — log of received cards (для UX «cards I imported», not strictly needed for v3.2 but cheap).

### Reuse existing primitives

- `exportBundle({textIds})` уже умеет subset-export — Mode A download использует.
- `importBundle()` уже принимает unified-format ZIP — Mode B full-ZIP variant использует.
- Lightweight `text-card-v1` JSON format — это **subset** library bundle: адаптер `importTextCard(json)` дегенерирует в bundle-shape и feed'ит в `importBundle()`.
- Existing v3UndoToast pattern — для Mode A «text added to library / undo».

### Privacy / consent

- Mode A: zero new privacy surface. Только existing `/api/translate-table-v2` + TTS — already covered.
- Mode B: file-based, **никакого server storage**. Privacy-positive — receiver получает только что sender chose to send.
- Mode C: feedback channel — already covered by existing privacy doc.
- **Documentation update needed**: `docs/PRIVACY.md` add section «Text-card sharing — что включается в файл, что нет».

---

## 7. Cross-direction interactions

### С Direction 9 (Premium Notes)

- Text-cards могут содержать sentence-bound notes inline в `row.note` (consistent с bundle compat policy from Direction 9 D2).
- **Advanced notes** (polymorphic targets, audio-anchored, templated, linked, versioned) **НЕ переносятся** через text-card share в v3.2 — consistent с D2.
- **Future v3.3:** text-card share **может** включать `notes_advanced.json` opt-in («include my advanced notes» checkbox в share modal). Defer.

### С Direction 11 (Ulpan diploma — Brainstorm C)

Direction 10 — **prerequisite для Direction 11**. Без text-card system:
- Каждый студент сам вставляет текст → разные результаты, разное аудио, разное качество.
- Teacher не может efficient распределять homework material.
- Невозможно научно сравнивать results between students (control vs experimental groups получают different inputs).

С Direction 10:
- Teacher generates weekly text-cards через Mode A (10 textов в batch).
- Distributes to class через Mode B (file send в group chat).
- Specific complex texts go through Mode C для curator-grade quality.
- All students работают с **identical material** — basis для научного сравнения.

**Это значит:** Direction 10 + Direction 11 шипятся вместе или Direction 11 не имеет смысла.

---

## 8. Phased ship strategy

| Phase | Scope | Effort | Risk |
|-------|-------|-------:|------|
| **10.0** | UX wireframes (Mode A modal, share-modal, file-import flow) + privacy section draft | 0.5 дня | Low |
| **10.1** | Mode A — Bulk builder (multi-text input modal, queue orchestrator, pre-flight estimate, progress UI, save-to-library + download-ZIP, OPFS state persistence) | 3–4 дня | Low (reuse existing pipeline) |
| **10.2** | Mode B — File-based share (export `text-card-v1` JSON, share modal с three options, full-ZIP variant, import-from-file flow, audio resolution на receiver-side с cache-miss re-synthesis fallback) | 2–3 дня | Low–medium (audio cache miss handling, mobile native share-sheet integration) |
| **10.3** | Mode C — Feedback category extension (Standard branch redirect, Curated branch WhatsApp template, request history tracking) | 1 день | Low |

**Total: ~7–8.5 дней** (~1.5 рабочей недели).

### Recommended cut for v3.2.0

**Ship all three (10.0 → 10.3 — D5).** Это premium-trio: builder + share + curator. Убирать любой — теряется story и enabling Direction 11 invalid.

### Defer to v3.3

- **Server-side TTL share-cache** — короткие public URLs (`https://app/share/<id>`). ~2–3 дня. Без него Mode B уже работает; URL-share — UX upgrade (one-click WhatsApp share без file attachment dance).
- **End-to-end encryption на share** — symmetric encryption с key-in-URL-fragment для приватных shares. ~1–2 дня. Mode B уже privacy-positive (file-based, no server storage); E2E нужен только когда добавляем server-side cache.
- **Received cards inbox** — отдельная вкладка в Library «Полученные карточки» с history. ~1 день. Nice-to-have.
- **Bulk limit increase 10 → 25** (D3) — после dogfood feedback.
- **Mode B include-advanced-notes opt-in** — coordinate с Direction 9 D2 при future Android update.

---

## 9. Acceptance criteria (release-level)

Перед закрытием Direction 10 в v3.2.0:

### Functional
- [ ] Mode A bulk-build 10 текстов completes successfully на typical homework set within 8 minutes.
- [ ] Mode A pipeline survives modal close + reopen без loss progress.
- [ ] Mode A partial failure retry preserves successful texts.
- [ ] Mode B lightweight JSON file size ≤ 50 KB для card до 100 rows.
- [ ] Mode B share-modal три option работают на mobile + desktop.
- [ ] Mode B receiver import preview показывает correct rows + audio status.
- [ ] Mode B pre-load audio (eager) — completes within ≤ 30s для 30-row card.
- [ ] Mode B full ZIP variant — backwards-compatible с existing `importBundle`.
- [ ] Mode C Standard branch redirects в Mode A с pre-filled content.
- [ ] Mode C Curated branch generates correct WhatsApp deep-link.
- [ ] Mode C request history tracking функционален.

### Performance
- [ ] Mode A modal open ≤ 200ms.
- [ ] Mode A pre-flight estimate accurate within ±20%.
- [ ] Mode B share modal open ≤ 100ms.
- [ ] Mode B lazy audio fetch — first play ≤ 2s for cache hit, ≤ 5s for cache-miss re-synthesis.

### i18n
- [ ] Все новые UI-strings в `ru` / `en` / `he`.
- [ ] Mode A pre-flight estimate strings handle plurals correctly.
- [ ] Mode B info-banner explaining audio-from-cache behaviour translated correctly.

### Privacy / data integrity
- [ ] Mode B file format includes only what user explicitly chose; no user identity leaked.
- [ ] Mode B receiver audio fallback (cache-miss → /api/tts) does not leak user metadata.
- [ ] `docs/PRIVACY.md` updated с new section «Text-card sharing».

### Documentation
- [ ] `docs/TEXT_CARD_PLAN_v3_2.md` (этот файл) — финальный status flip [ ] → [x] во всех секциях.
- [ ] `docs/STORAGE_CONTRACT.md` — обновлён с описанием `text-card-v1` format и cross-references на `library/library.json` shape.
- [ ] User-facing: in-app onboarding modal extension объясняет text-card sharing (на первом open после upgrade).

---

## 10. Test plan

### Unit / integration tests

- `tests/text_card_builder.test.js` (new) — Mode A pipeline orchestration: queue, retry, partial failure, OPFS state persistence.
- `tests/text_card_share.test.js` (new) — Mode B export → re-import roundtrip; lightweight JSON validation; audio resolution paths (cache hit / miss / re-synthesis).
- `tests/text_card_import.test.js` (new) — receiver-side import preview; XSS sanitization on `source_text`.
- `tests/feedback_card_request.test.js` (new) — Mode C Standard branch redirection; Curated WhatsApp template generation.

### Manual smoke

- 10-text bulk build на test corpus — verify quota estimate accuracy, time-to-complete, partial-failure retry.
- Share lightweight JSON via WhatsApp на mobile → import на second device → audio plays without re-synthesis (assuming both devices use same Railway инстанс).
- Share full ZIP via email → import on offline device → audio plays from embedded.
- Mode C Standard → verify pre-fill correctness in Mode A.
- Mode C Curated → verify WhatsApp deep-link contains full text + metadata.

### Visual regression

- Mode A modal layout на light + dark themes.
- Mode B share modal three-option layout.
- Receiver preview-modal on mobile (bottom-sheet style).
- RTL rendering (Hebrew title в card preview).

### Cross-device test

- 2 устройства, оба connected к одному Railway production инстансу.
- Sender: Mode A bulk-build 1 text → share lightweight JSON via WhatsApp.
- Receiver: import → play first row → verify cache hit (no re-synthesis time).
- Sender: same flow, но receiver на different Railway инстанс → verify cache-miss re-synthesis path.

---

## 11. Risk register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Mode A pipeline interrupted (network drop, browser crash) → user loses progress | Medium | OPFS state persistence (`text_card_jobs` localStorage); resume on reload. |
| R2 | Mode B audio resolution fails (cache miss + TTS quota exceeded) | Medium | Graceful degradation: rows display + plain audio TTS button per row; clear error message. |
| R3 | Mode B file format drift между web и future native Android | Low | Strict schema versioning (`format: "linguistpro-text-card-v1"`); reject unknown versions с friendly message. |
| R4 | Mode C Curated WhatsApp message exceeds char limit | Low | Hebrew text в file attachment, не в URL; metadata в URL ≤ 500 chars. |
| R5 | Quota burn от user-error в Mode A (e.g. accidentally pasted huge text) | Medium | Pre-flight estimate с explicit char count + cost; user must confirm. |
| R6 | UI complexity bloat — three modes мог запутать users | Low–medium | Default entry: «📦 New text-card» → Mode A. Mode B only via «Share» button on existing card. Mode C only via Feedback. Each mode discoverable in its natural context. |
| R7 | Text-card containing sensitive content shared inadvertently | Low | Privacy preview на share — user видит exactly что включается. No `source_text` privacy options for v3.2 (defer to v3.3). |
| R8 | Mode B XSS attack via maliciously crafted `source_text` | Low | Existing import sanitizes; explicit `text-card-v1` schema validation pre-import. |
| R9 | Mode A bulk limit 10 too restrictive for some users | Low | Documented; can poll dogfood for v3.3 increase. Start conservative (D3). |
| R10 | Receiver на different Railway инстанс — cache-miss re-synthesis cost | Low | One TTS call per row на first play; subsequent plays cached. User sees cost once, never again. |

---

## 12. Out of scope (явно не в этом Direction)

- **Server-side TTL share-cache** — короткие public URLs. → v3.3.
- **End-to-end encryption** для private share. → v3.3.
- **Received cards inbox** (отдельная вкладка). → v3.3.
- **Bulk limit increase 10 → 25** (D3). → v3.3 после dogfood.
- **Mode B include-advanced-notes opt-in.** → v3.3 + coordinate с Direction 9 Android update.
- **Card editing после share** (live-link, version reconciliation). → v3.3 short-link feature.
- **Multi-curator routing** (не только developer, а pool of curators). → out of scope, нужны user signal + moderation infrastructure.
- **Subscription/payment** для curated requests. → out of scope.
- **Auto-content-moderation** на shared cards. → out of scope.

---

## 13. Open questions

1. **Mode B share-sheet integration на iOS Safari** — Web Share API support patchy; may need fallback to «Save file → manually attach in WhatsApp». Verify during 10.0 wireframes.
2. **Mode A 10-text limit — soft or hard?** Hard limit prevents quota disasters; soft (warning + confirm) gives flexibility. Decision: **hard** for v3.2, revisit after dogfood.
3. **Card title auto-extract** — first line vs first sentence vs first 50 chars? Testing needed; default: first line, ≤ 100 chars, fallback «(без названия)».
4. **Cache-miss re-synthesis limit** — should we cap re-synthesis attempts per session (e.g. max 50 rows re-synthesized)? Quota protection. Decision: warn at 20+ re-syntheses in session, hard-cap at 100.
5. **Format versioning strategy** — `text-card-v1` is locked для backwards compat. Future `v2` adds advanced notes; old web reads v1 only, new web reads both. Documented in `STORAGE_CONTRACT.md`.

---

## 14. Live status

> Обновляется по мере реализации. Каждая Phase — `[ ]` planned → `[~]` in-progress → `[x]` done.

- [ ] **Phase 10.0** — UX wireframes + privacy section draft
- [ ] **Phase 10.1** — Mode A — Bulk builder
- [ ] **Phase 10.2** — Mode B — File-based share
- [ ] **Phase 10.3** — Mode C — Curated request channel

---

**Last updated:** 2026-05-10 (initial commit)
