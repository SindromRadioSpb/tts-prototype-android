# Reading Room B8 — Reading Journey decision packet

Дата: 2026-08-13
Статус: **APPROVED · OWNER-LIVE D2 CORRECTION 2026-08-13**
Baseline: `main@951302392c741a051faf1a95466ff494a2df3757`, app `3.11.373`
Research evidence: `docs/research/room-ux-b8-reading-journey/2026-08-13/`

Владелец утвердил D1–D6, `MIGRATION=NONE` и `SCOPE=IMMEDIATE_B8_ONLY` точной
строкой из §9. Последующим сообщением владелец отдельно разрешил production deploy,
production verification и bounded fix/redeploy loop. B0–B7 закрыты. Ни один вывод
ниже не переоткрывает их без конкретного product regression evidence.

После успешного owner-live smoke владелец принял все остальные пункты B8 и предъявил
конкретное педагогическое regression evidence только для D2: в больших учебных
материалах пользователь осознанно возвращается к ранним абзацам и ожидает, что следующее
«Продолжить» откроет именно последнюю рабочую строку. Поэтому первоначальный
`D2=C_MONOTONIC_PROGRESS_PLUS_HISTORY` **superseded только в части monotonic resume** на:

```text
D2=D_LAST_WORKED_POSITION_PLUS_SEPARATE_BOOKMARKS
```

`MIGRATION=NONE`, D1/D3/D4/D5/D6 и закрытие B0–B7 сохраняются.

## 1. Executive verdict and measured problem statement

### Вердикт

Reading Room **не нужна новая монолитная Reading Journey поверхность и не нужна новая
journey-таблица**. Большинство learner facts уже имеют ровно один канон:
`text_progress`, `bookmarks`, `notes_v2`/`note_occurrences`, append-only `review_log`
и его `word_status` projection. B8 должен стать небольшим **read-only композиционным
слоем** в существующем Learning Home. Owner-live проверка уточнила writer invariant:
durable row — последняя рабочая позиция и потому может осознанно уменьшаться.

Рекомендованный immediate B8:

1. сохранить отдельные semantics для saved work, passage bookmark, last worked position
   progress и finished;
2. считать `text_progress.last_row_idx` durable last-worked/resume anchor: новая валидная
   рабочая строка заменяет прежнюю в обе стороны; furthest остаётся только session-only
   сигналом end-of-text и не становится второй durable truth;
3. добавить в существующий Learning Home один компактный блок «Ваше чтение»:
   source-neutral Continue и bounded read-only переходы к «Закладки», «Закончено»,
   «С заметками» — без cover feed и без второго writer;
4. составлять note/vocabulary/media признаки только из существующих канонов;
5. прямо показывать recovery scope: My Texts cloud только после consent, learner log
   sync отдельно, Ben/Study journey state и Ben reading lists — на этом устройстве;
6. не добавлять exact media-second resume, cross-device corpus journey sync или новую
   saved-work persistence в immediate B8. Это отдельные privacy/data decisions.

### Измеренная проблема

| Finding | Evidence | Severity | B8 action |
|---|---|---:|---|
| Monotonic row не позволяет продолжить работу с ранее выбранного абзаца | owner-live smoke большого учебного материала; explicit expected `80 → 10 → Continue 10` | P1 pedagogical regression, изолированная в B8 D2 | last-write working position; bookmark остаётся отдельно |
| Journey readers разбросаны по источникам | Ben-only `getContinueReading()/getFinishedTexts`; Study local filter; My card state; source-neutral Learning Home continue only | P1 continuity gap | compact projection in existing Learning Home |
| Passage bookmark и saved work визуально соседствуют, но authority различна | DB `bookmarks` vs `localStorage.corpus_reading_lists_v1` | P1 semantic/recovery risk | разные labels/actions/identities; не merge |
| Exact media currentTime отсутствует | media tables/passport без learner playback field; teardown clears player | P2 expectation gap | label resume by row, not seconds; backlog exact media resume |
| Ben/Study learner state is local-only | artifact sync explicitly excludes corpus | P1 recovery risk | honest device/backup copy; no silent sync expansion |
| Global bookmark retrieval not source-neutral in UI | bookmark DB/list is global; shelf injection is Ben path | P2 discovery gap | source-neutral projection query/list, bounded |
| Room has no storage-persistence status/affordance | no Room `navigator.storage.persist()` call | P2 resilience gap | show local/recovery semantics; optional persist request only as separately approved small slice |

### Baseline health and blockers

- Public production readback: version `3.11.373`, `/healthz` and client config HTTP 200,
  DB/migrations ready.
- Production reports `disk_pct_used=99`, `disk_warn=true`. This is an operational
  blocker to clear before any eventual deploy, not B8 UX regression, and was not
  remediated in this research-only goal.
- Synthetic: resume 45/45, bookmarks 11/11, artifact sync 11/11, cloud sync 32/32,
  finished guard 9/9, word status PASS.
- Two browser smokes have stale entry/expectation after closed IA/B7; `sync-slim`
  timed out without assertions. These are harness debt/uncertainty, not product PASS
  and not evidence to reopen B0–B7.

## 2. Live-code and data-flow inventory

Full evidence table: [CURRENT_STATE_INVENTORY](../research/room-ux-b8-reading-journey/2026-08-13/CURRENT_STATE_INVENTORY.md).

### 2.1 Durable learner facts

| Fact | Canon and identity | Writer | Current readers | Portability / cloud |
|---|---|---|---|---|
| Progress | `text_progress(text_id PK, last_row_idx, last_step_id, updated_at)`; portable work identity `text_key` | `LocalDb.setTextProgress()` | Reader, My/Study cards, Ben/Study filters, Learning Home | per-text bundle; My Text cloud only with consent; corpus device-local |
| Finished | `text_progress.finished_at` | only explicit finish/unfinish handlers | Ben finished, Study filter, My state | same scope as progress |
| Passage bookmark | `bookmarks.id`; semantic location `text_key + order_index`; local FK `text_id/sentence_id` | `addBookmark/removeBookmark` | Reader and list/search; UI discovery currently Ben-skewed | bundle re-anchor; My Text consented artifact; corpus device-local |
| Note | `notes_v2.id`; position in `note_occurrences` where canonical | create/update note, canonical-note/occurrence APIs | Reader, Notes, smart filters | text-bound notes follow artifact; canonical note state can sync, corpus occurrence does not |
| Manual vocab | `lemma_key`; event truth `review_log kind=mark`, projection `word_status.status` | `setWordStatus()` | Reader/vocabulary/familiarity | dedicated learner-log sync, manual LWW replay |
| SRS | deterministic review-event id / item key | atomic `commitReviewAttempt()` | training/due/familiarity | append-only union, projection rebuild |
| Media content | package/track/revision/binding ids + SHA | Studio/Import Center repository | Reader media adapter | content package semantics, not learner progress |

Schema/function anchors:

- `public/db/migrations.js:51–57`, `475–507`, `684–697`, `760–824`,
  `833–880`, `929–995`;
- `public/db/local-db.js:1751–2126`, `3076–3169`, `3347–3535`,
  `4276–4428`, `5590–5908`, `6305–6351`, `6959–7305`;
- `public/js/cloud-sync.js:3–19`, `37–101`, `164–230`, `269–427`, `442–609`.

### 2.2 Presentation state is not learner truth

`roomCurrentPresentationState()` serializes surface/corpus/drill/filter/visible/anchor
to History/session (`library-ui.js:699–779`). The pure policy limits it to 8 KiB and
24 hours (`room-b6-core.js:8–17`, `131–183`). History restore deliberately avoids a
learner-state `touchOpened` (`library-ui.js:6845–6858`).

This is correct for Back/Forward, filter return and same-session reader return. It
cannot prove durable last place, survive eviction/new device, participate in backup,
or resolve learner conflicts. B8 keeps that boundary.

### 2.3 Source adapters today

- **My Texts:** DB-first 48-card page; each text already is a library object. Artifact
  cloud is explicit-consent only; UI already says «на этом устройстве» where relevant.
- **Study Songs:** membership-gated catalog; work is materialized locally on open;
  progress/finish query joins local `text_progress`; learner facts remain local.
- **Ben-Yehuda:** catalog work is served-on-open/materialized by stable `text_key`;
  continue/finished helpers are Ben-only; named reading lists are browser localStorage.
- **Learning Home:** `getLearningHomeContinue()` already chooses across all locally
  materialized sources with entitlement guard. It is the smallest safe home for B8.

### 2.4 Owner-live confirmed gap: last working position

Первоначальный research трактовал понижение stored row как дефект. Реальный учебный smoke
доказал обратное: интервью и длинные материалы изучаются нелинейно, а возвращение к раннему
абзацу является новым рабочим местом, не потерей прогресса.

Recommended invariant:

```text
persisted_resume_row = latest_valid_working_row
session_furthest_row = max(rows_reached_in_current_session)  // end prompt only
```

Это по-прежнему один существующий writer и одно durable поле. При смене строки
`last_step_id` следует за новой записью либо очищается. Passage bookmark, `finished_at`
и session-only furthest не смешиваются с resume truth.

### 2.5 Confirmed gap: exact media resume

`roomMediaSetup()` restores media passport/binding; `roomMediaTeardown()` destroys the
runtime player. No schema field stores player `currentTime`. Karaoke row movement does
call reading-row progress, so a user can return approximately to a text row. A note's
`audio_anchor_ms` is its annotation anchor, not media resume.

Immediate copy must say «Продолжить со строки …», never «с 01:42». Exact seconds are
backlog until ownership, frequency, cross-device and conflict semantics are approved.

## 3. Competitor, accessibility and web-platform research

Full observation/decision split: [EXTERNAL_RESEARCH](../research/room-ux-b8-reading-journey/2026-08-13/EXTERNAL_RESEARCH.md).

| Primary source observation | Applicable B8 principle | Not copied |
|---|---|---|
| Kindle syncs reading position/notes/highlights under an explicit server/connectivity contract ([Amazon](https://digprjsurvey.amazon.co.uk/csad/help/node/GGFEXXS8Z7DPJSTN?theme=light)) | cloud label must match actual contract | no claim that corpus state syncs today |
| Apple separates auto place, deliberate bookmark, Want to Read and Finished ([Apple Books](https://support.apple.com/guide/iphone/read-books-iphc1af7c57/ios)) | four separate facts/actions | no Apple-style collection model |
| Readwise documents furthest progress and last location separately ([Reader FAQ](https://docs.readwise.io/reader/docs/faqs)) | expose honest last-position semantics; keep completion evidence separate | no second durable field in B8 |
| LingQ composes reader word state and vocabulary review ([LingQ](https://www.lingq.com/en/ios-app-support/)) | compose existing note/status/SRS readers | no auto-mark-known behavior |
| OPFS/IndexedDB are best-effort unless persistent storage is granted ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) | show device/recovery scope | no guarantee after user clears site data |
| History API is session navigation state ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/History_API)) | keep B6 presentation separate | no promotion to learner canon |
| WCAG 2.2 covers keyboard, reflow, focus, text spacing, target size ([W3C](https://www.w3.org/TR/WCAG22/)) | include semantics in acceptance | no automation-as-physical-AT claim |

## 4. User journeys and failure-state matrix

### 4.1 Golden journey

```text
Find material
  -> optionally save the work OR open it
  -> read; progress writes through text_progress
  -> return through History (presentation) or Learning Home (durable projection)
  -> Continue from the latest genuine working row, including an earlier paragraph
  -> add passage bookmark / note / word status / review event through its own canon
  -> media may follow the row, not exact persisted seconds
  -> explicitly mark Finished
  -> later retrieve through bounded Continue / Bookmarks / Finished / With notes views
```

Rules at each step:

- «Save work» never creates a passage bookmark.
- Opening, Back/Forward, closing, refresh and viewing a journey filter create zero
  `review_log` events.
- Finished is explicit, never inferred from reaching the last row or media end.
- B8 projection never copies note bodies, title/query text or learner identifiers into
  telemetry/diagnostics.
- A list contains only material the user remains entitled to open; an unavailable Study
  work is shown as unavailable/requires access, not silently opened from stale local data.

### 4.2 Three-source journey matrix

| Step | My Texts | Study Songs | Ben-Yehuda |
|---|---|---|---|
| Find | existing My Texts search/filter | membership catalog search/filter | catalog/search/author/period |
| Save work | already owned in My library; no redundant saved toggle | catalog membership, no personal saved writer | current named local reading lists |
| Start | local text id | materialize by work/text key, entitlement check | served-on-open materialize by text key |
| Return | History or Learning Home | History or Learning Home | History, Learning Home, catalog/list |
| Continue | canonical `text_progress` | same local canon | same local canon; older Ben helper is source-specific |
| Bookmark passage | `bookmarks` | `bookmarks` after materialization | `bookmarks` after materialization |
| Note / word | existing notes + lemma/SRS canons | same; exact corpus occurrence local | same; exact corpus occurrence local |
| Media | passport/binding if present; row-only resume | catalog/package audio, row-only resume | baked audio where available, row-only resume |
| Finish | explicit `finished_at` | explicit, group filter | explicit, Ben finished view |
| Find later | My library + B8 projection | group catalog + B8 projection while entitled | reading list/bookmarks/finished + B8 projection |

### 4.3 Failure-state matrix

| Failure | My Texts | Study Songs | Ben-Yehuda | Required behavior |
|---|---|---|---|---|
| Offline after prior load | local content/state works | materialized content/state works; membership refresh may be stale | materialized/catalog-cached content works to actual cache boundary | label offline; queue no invented cloud writes; preserve single writers |
| First open offline | local My Text can open | unmaterialized catalog work cannot | unmaterialized body may not be available | actionable unavailable message, no blank/stuck shell |
| Reconnect | artifact/review sync by existing consent/auth contracts | review log can sync; corpus progress cannot | same | never imply corpus journey upload; idempotent reconcile |
| PWA/browser eviction | recover from consented artifact or explicit backup; otherwise loss | local journey loss except backed-up facts; server catalog is not learner backup | same; reading lists may also vanish | show device-local and backup boundary before loss; no false recovery promise |
| New device | My Text only if consented/imported; learner log separately | catalog appears after auth, learner corpus journey does not | catalog appears, learner corpus journey does not | empty local journey is honest, not a sync error |
| Delete/re-import | bundle replace can restore | cascade can remove progress/bookmark/text-note; re-materialization alone does not restore | same | warn on destructive delete path; B8 projection must not silently synthesize old state |
| Two-device conflict | whole My Text artifact LWW | no corpus artifact conflict because fact does not sync | same | keep current LWW; review events union/manual LWW remain separate |
| Entitlement revoked | own text unaffected | journey row becomes unavailable, no content leak | N/A for public corpus | preserve identifier-only local state if policy allows; do not render restricted content |
| Note conflict | artifact/state LWW per existing contract | corpus text-bound note local | corpus text-bound note local | no B8 merge editor |
| Deliberate backward study | same last-position writer | same | same | lower valid row becomes next Continue; bookmark remains separate |
| Media bytes absent/timing invalid | current honest media reason | same | same | no exact resume claim; Reader remains usable as text |
| RU/HE/RTL/200% | all labels/actions | Hebrew titles + RU/HE chrome | same | bidi isolation, no clipped state/action, logical properties |
| Keyboard/AT | focusable Continue/filter/list; status announced | same + unavailable semantics | same | DOM order = visual order; focus restore; Escape for modal/disclosure; no chip-only meaning |

## 5. Decisions D1–D6

### D1 — cross-corpus saved/bookmark identity and authority

Options:

- **D1-A — treat every save as `bookmarks`: reject.** A passage position is not a
  saved work; it would create fake sentence anchors and break import semantics.
- **D1-B — repurpose `shelves`: reject.** Shelves contain curated pedagogical routes
  and provenance (`origin`); flattening them into personal saved works mixes curated,
  asserted and user truth.
- **D1-C — keep explicit typed identities: recommend.** Passage bookmark authority
  remains `bookmarks`; work-save authority remains source-specific. A pure adapter may
  expose `RoomWorkRefV1 {source_kind, text_key, source_scope, source_work_id}` for links
  and projections, but is not a new persistence writer.

Decision recommendation: **D1=C_TYPED_SEPARATE**.

Immediate semantics:

- My Text is already in the user's library; no redundant «save work» state.
- Study Songs catalog membership is not a personal save.
- Ben reading list remains explicitly «на этом устройстве» in B8; passage bookmarks
  from all materialized sources appear in one read-only Bookmarks view.
- Cross-device saved-work persistence is backlog and requires a separate authority,
  privacy and conflict decision.

### D2 — one recoverable journey presentation / last-place model

Options:

- **D2-A — History/session as last place: reject.** It expires, is tab-local and is
  presentation only.
- **D2-B — add new exact-last-location schema field now: defer.** Mature products can
  distinguish last location from furthest progress, but B8 has no evidence that the
  extra writer/conflict policy pays for itself.
- **D2-C — monotonic existing progress: superseded by owner-live evidence.** Он защищает
  furthest, но не поддерживает нелинейную проработку больших материалов.
- **D2-D — last worked position + separate bookmarks: approved correction.**
  `text_progress.last_row_idx` хранит последнюю рабочую строку, History восстанавливает
  presentation context, passage bookmark остаётся отдельным явным якорем.

Current decision: **D2=D_LAST_WORKED_POSITION_PLUS_SEPARATE_BOOKMARKS**.

Writer invariant after approval:

```text
latest genuine row interaction may move stored resume in either direction
passive page or media-table scroll is context browsing and writes no working row
row 0 remains a valid restored working marker but needs no Continue-at-start affordance
programmatic scroll settling and teardown cannot replace the explicit target
finished remains manual-only
history restore writes neither progress nor review_log until genuine reading interaction
```

### D3 — notes, vocabulary and media composition without a second writer

Options:

- **D3-A — denormalized journey table/counter cache: reject.** It creates reconciliation,
  privacy and invalidation risk.
- **D3-B — read-only composition from canonical queries: recommend.** Journey rows may
  show booleans/counts (`has_bookmark`, `finished`, `has_note`, `manual_word_count`,
  `media_available`) produced by bounded SQL/adapters; actions route to existing writers.
- **D3-C — store exact media currentTime: defer.** Needs separate identity, write cadence,
  playback-vs-reading precedence and sync policy.

Decision recommendation: **D3=B_CANONICAL_COMPOSITION_ROW_MEDIA**.

`audio_anchor_ms` must never be read as playback resume. Media continuation may seek to
the start of the canonical reading row when timing exists and the user explicitly resumes.

### D4 — saved / filtered / finished views

Options:

- **D4-A — new top-level journey dashboard/cover feed: reject.** No measured need;
  duplicates closed IA and expands DOM/network scope.
- **D4-B — compact Learning Home block with bounded filtered views: recommend.** One
  primary Continue, then quiet text links/counters to Bookmarks, Finished and With notes.
  Results are read-only projections, paged 48, no full-body scans.
- **D4-C — keep fully fragmented readers: reject.** Canon exists but retrieval fails the
  requested find-later journey.

Decision recommendation: **D4=B_COMPACT_HOME_PROJECTIONS**.

Hierarchy:

1. one primary Continue action with source/title and honest row progress;
2. secondary «Закладки», «Закончено», «С заметками»;
3. source filters inside the result view, not competing home cards;
4. Ben «Читать позже» remains a separate device-local list link, not merged into bookmarks.

### D5 — offline, cross-device, re-import and conflict semantics

Options:

- **D5-A — silently cloud-sync all corpus journey state: reject.** Existing architecture
  deliberately excludes corpus artifacts and a privacy/server/storage decision is absent.
- **D5-B — preserve current sync boundaries and explain them: recommend.** My Text artifact
  requires consent; review/vocab log sync is separate; Ben/Study progress/bookmarks/text
  notes and Ben reading lists are local; explicit backup is the recovery path.
- **D5-C — device-only without recovery UI/copy: reject.** Technically true but UX-incomplete.

Decision recommendation: **D5=B_HONEST_EXISTING_BOUNDARIES**.

Conflict policy remains:

- review log: deterministic-id union;
- manual status: LWW replay over mark events;
- My Text artifact: existing whole-artifact LWW;
- bookmarks: local unique position, bundle re-anchor/union;
- progress: existing last-write position policy, including deliberate backward study;
- notes/shelves: current bundle/state LWW/merge;
- presentation: session latest only, never learner conflict input.

Optional persistent-storage request is allowed only as an explicit, user-triggered,
non-blocking affordance with the browser's honest outcome. It cannot replace backup.

### D6 — premium hierarchy, a11y/RTL/scale/privacy/evidence rollout

Options:

- **D6-A — dense card grid with badges/gamification: reject.** Competes with reading,
  performs poorly at scale and violates the stop list.
- **D6-B — calm typographic journey list: recommend.** Title/source/action first;
  progress in plain language; small secondary state; disclosure for recovery details.

Decision recommendation: **D6=B_CALM_BOUNDED_EVIDENCE_GATED**.

Required qualities:

- RU and HE UI copy; Hebrew work identity uses isolated RTL spans in both chrome directions;
- keyboard order follows DOM/visual order; Enter/Space activation; visible non-obscured
  focus; Escape/return focus for any dialog; live region only for actual async state;
- 200% owner gate plus automated 320 CSS px reflow and text-spacing override;
- touch targets at least WCAG 2.2 24 CSS px, project premium target 44 CSS px for primary
  mobile actions where layout permits;
- B6 page 48/API max 96/card packet max 256 KiB/presentation max 8 KiB/24h;
- no learner content, work/text/note/query/title identifiers or raw errors in diagnostics;
- automation, production readback, physical devices and AT are four separate evidence classes.

## 6. Invariants, ownership, stop list and rollback boundary

### 6.1 Exact invariants

1. One fact, one authority: B8 adds no progress/bookmark/note/vocabulary/SRS store.
2. `text_progress.last_row_idx` equals the latest valid working row and may decrease after
   deliberate backward study; passive browsing scroll and transient programmatic
   scroll/teardown cannot change it.
3. Finish/unfinish remains explicit; end-of-text/media never auto-finishes.
4. Open/close/Back/Forward/refresh/filter writes zero `review_log` rows.
5. One completed grade writes exactly one review event; B8 never invokes grade.
6. Passage bookmark and saved work remain different types and labels.
7. Presentation state never overrides durable learner state.
8. `notes_v2.audio_anchor_ms` never becomes media resume truth.
9. My Text cloud artifact requires existing consent; corpus artifacts still do not upload.
10. An unavailable Study Songs item never leaks restricted content through journey projection.
11. Import/reimport never silently manufactures progress/bookmarks/notes.
12. Journey projection is bounded/paged and does not scan text bodies or note bodies for home paint.
13. Diagnostics contain only the B6 allowlisted non-content fields.
14. RU/HE/RTL/200%, keyboard and focus behavior are release gates, not Visual-finishing backlog.
15. B0–B7 acceptance remains closed unless a reproducible product regression is recorded.

### 6.2 Data ownership table

| Fact | Authority | Allowed B8 reader | Allowed B8 writer | Forbidden duplicate |
|---|---|---|---|---|
| last working row | `text_progress` | journey query/Reader | existing `setTextProgress`, last deliberate row interaction/playback/explicit jump | History/localStorage journey row |
| session furthest | Reader memory only | end-of-text prompt | current Reader session | durable furthest field/table |
| finished | `text_progress.finished_at` | projection/filter | existing manual handlers | inferred completion cache |
| passage bookmark | `bookmarks` | cross-source bounded list | existing bookmark toggle | saved-list entry as bookmark |
| saved work | source-specific current contract | typed link/projection | Ben current list helper only | `bookmarks` or curated shelf alias |
| note | `notes_v2`/`note_occurrences` | has/count/link | existing note APIs | journey note copy |
| manual vocab | review log/word status | has/count/link | existing manual-state API | journey status field |
| SRS | append-only `review_log` | due/count/link only | training commit only | journey review writer |
| media content | media package/binding/passport | availability/row timing | existing media repository | journey media metadata copy |
| presentation | History/session | navigation restore | B6 presentation adapter | durable learner store |

### 6.3 Hard stop list

- no second writer for progress/bookmarks/notes/vocabulary/SRS;
- no mix of asserted, derived, curated and presentation truth;
- no schema/LocalDb/FSRS/review-log/SW change before approval;
- no opaque AI recommender, mandatory quiz wall, cover-grid feed, gamification or
  content telemetry;
- no B9 Curated Paths or generic Visual finishing inside B8;
- no automation labelled physical device/AT/owner-live;
- no research defect fix before packet approval;
- no owner-profile write or synthetic owner review event;
- no deploy while production disk warning remains unresolved under a separately
  authorized operations flow.

### 6.4 Rollback boundary

Recommended implementation needs no migration. Runtime rollback is one version revert of:

- compact projection UI/query adapters;
- last-working-position policy and session-only furthest signal;
- B8-specific copy/tests.

Because no new canonical store is introduced, rollback does not transform learner data.
Rows written under last-position policy are valid existing `text_progress` rows. Runtime
rollback does not transform them. Ben reading-list payload and review log are untouched.

## 7. Red-test-first implementation packet after approval

### 7.1 Slices and gates

| Slice | Red evidence first | Implementation outcome | Gate |
|---|---|---|---|
| B8-I0 contract tests | stored row 80 + deliberate earlier row 10 | RED until last-position helper/writer exist | owner-live expected `Continue 10` |
| B8-I1 last-position resume | passive scroll, explicit row engagement/continue/bookmark, close, refresh, History restore | passive context browsing is a no-op; latest deliberate row; separate session furthest; honest position copy | `80 → engage 10 → passive scroll → reload → Continue 10`; zero review-log delta |
| B8-I2 journey projection | source-neutral fixtures for My/Study/Ben; unavailable entitlement; 1k/5k | compact Learning Home + paged Bookmarks/Finished/With notes views | unit/query/browser, payload/DOM/memory budgets |
| B8-I3 recovery/a11y | offline/eviction/new-device copy, RU/HE/RTL, keyboard, 200%, 320px/text-spacing | device/cloud labels and focus semantics | automated a11y + physical matrix |
| B8-I4 harness repair | current media chip expectation, hidden legacy tab, sync-slim timeout | modern entry path/expectations without product-semantic drift | all targeted smoke gates deterministic |
| B8-I5 beta/release | served version/cache/health, disk preflight, owner read-only boundary | staged beta then production only under separate release approval | automation → beta → production → owner-live evidence kept separate |

### 7.2 Proposed implementation allowlist

No file below may change before `APPROVE B8-R`.

Immediate code allowlist after approval:

- `public/js/reader-progress.js`
- `public/db/local-db.js` — existing progress policy and bounded read-only journey queries only; no schema
- `public/js/library-ui.js`
- `public/library.html`
- `public/i18n/locales/ru.js`
- `public/i18n/locales/he.js`
- `public/i18n/locales/en.js`
- `tests/roomB8ReadingJourney.test.js` (new)
- `scripts/premium/room-b8-reading-journey-smoke.js` (new)
- `scripts/premium/reader-notes-smoke.js` — entry-path repair only
- `scripts/premium/room-media-smoke.js` — B7-compatible expectation only
- `scripts/premium/sync-slim-smoke.js` — deterministic shutdown/diagnostic only if root-caused
- `package.json` — add one B8 smoke command only during implementation
- B8 planning/research evidence files.

Explicit code stop list unless a new owner decision expands scope:

- `public/db/migrations.js`, server schema/routes, `public/js/cloud-sync.js`;
- FSRS/review-log grading logic;
- corpus catalog/bodies/shards;
- Studio/Import Center media canon;
- service worker/version files before a separately approved release slice;
- B9/Visual files.

Release-only allowlist, after implementation gates and explicit release authority:

- `package.json`
- `public/index.html`
- `public/library.html`
- `public/sw.js`
- release/closure evidence docs.

### 7.3 Migration decision

**NO MIGRATION for immediate B8.** Existing stores are sufficient. A new schema field
would be justified only by a separately approved exact-last-location, cross-device corpus
journey or exact media-time contract. No opportunistic nullable field is allowed.

### 7.4 Quantitative budgets

| Budget | Gate |
|---|---:|
| list page size | 48 |
| API/query hard max where API exists | 96 |
| visible card/list packet | <= 256 KiB |
| History/session presentation | <= 8 KiB, TTL 24h |
| diagnostic ring | <= 120 entries / 64 KiB / 7d |
| 5k corpus window | exactly <= 48 materialized journey rows |
| query p95 synthetic 5k | <= 50 ms warm; <= 100 ms cold on reference harness |
| home first journey paint | no text-body or note-body scan; <= 1 bounded aggregate/query round |
| long tasks from opening/filtering B8 | 0 tasks >= 50 ms in gate run |
| retained heap after 20 open/filter/close cycles | <= +10 MiB over stabilized baseline |
| DOM growth after 20 cycles | returns to baseline + <= 8 nodes |
| diagnostic content | 0 learner/content identifiers and 0 raw content fields |

The B6 closure numbers remain the comparison baseline, not a promise that synthetic
automation equals low-end phone owner evidence.

### 7.5 Automation matrix

- unit: typed identity, latest-position replacement, separate session furthest,
  finish manual-only, source/entitlement guards;
- DB: bounded aggregate query, stable ordering/cursor, 1k/5k, no body reads;
- browser: full golden journey for three sources, Back/Forward/refresh, offline/reconnect,
  no page errors, focus restore, 380px RU/HE;
- sync: My Text consent/no-consent, corpus exclusion, review-log union, equal replay;
- backup: My Text and full backup re-anchor semantics; explicit non-coverage of Ben list;
- privacy: B6 sanitizer plus network/log scan for title/note/query/text/lemma/content;
- production: served APP/CACHE/version/image/health readback only after release approval.

### 7.6 Physical and AT acceptance matrix

`PASS` is allowed only for actually performed rows.

| Environment | Required scenarios | Status before implementation |
|---|---|---|
| owner iPhone Safari, RU + HE/RTL | find/start/continue/bookmark/note/media-row/finish/find-later; 200%; offline/reconnect | NOT RUN for B8 |
| owner installed PWA iPhone | cold reopen, Back/Forward, offline, reconnect, storage/recovery copy | NOT RUN for B8 |
| PC Chrome keyboard | Tab/Shift+Tab, Enter/Space, Escape, focus return, 200% | NOT RUN for B8 |
| VoiceOver iOS | headings/links/state labels, list/filter semantics, focus after dialog/back | NOT RUN; cannot inherit B7 exception as PASS |
| NVDA + Chrome/Firefox | same semantics and live-region restraint | NOT RUN |
| Android Chrome/TalkBack | same plus PWA/storage behavior | NOT RUN |
| macOS Safari/VoiceOver | History/focus/RTL/reflow | NOT RUN |

Owner-profile live verification, if later authorized, is read-only: record `review_log`
count before/after, do not grade/change status/progress/note/bookmark/calibration. Synthetic
fixtures remain the default for writer tests.

## 8. Immediate B8 versus backlog / B9 / Visual

### Immediate B8 after approval

- last-working-position writer + honest position wording + separate session-only furthest;
- compact «Ваше чтение» block in existing Learning Home;
- source-neutral bounded Bookmarks/Finished/With notes projections over materialized data;
- typed distinction between saved work and passage bookmark;
- device/cloud/backup/re-import honesty;
- RU/HE/RTL/200%/keyboard semantics;
- stale B8-adjacent smoke repair and full evidence gates;
- no migration, no new server sync contract.

### Backlog requiring a separate decision

- durable exact last location distinct from furthest progress;
- exact media-second resume and its write/sync precedence;
- cross-device Ben/Study progress/bookmarks/text-bound notes;
- cross-device/source-neutral saved-work collections;
- Room-wide persistent-storage request/status UX beyond a small honest affordance;
- recovery/import for Ben named reading lists;
- multi-device merge UI for My Text artifact beyond current LWW.

### Explicitly B9 / Visual finishing, not B8

- Curated Paths, editorial route hierarchy and producer curation tools;
- new cover/art direction, generalized motion/polish pass;
- recommendation feed or algorithmic next-work ranking;
- unrelated shell typography/layout refinements.

## 9. Owner decision and approval line

### Recommended decision summary

- D1: typed separation; DB passage bookmarks stay canonical, saved work remains
  source-specific and explicitly device-local where applicable.
- D2: one composite journey UI; last worked position drives Continue; explicit bookmarks
  and History remain separate facts/presentation.
- D3: read-only note/vocab/media composition; row-based media continuation only.
- D4: compact Learning Home projections, no new dashboard/feed.
- D5: preserve and explain current consent/cloud/device/reimport/conflict boundaries.
- D6: calm bounded hierarchy with RU/HE/RTL/200%/keyboard, B6 scale/privacy budgets,
  staged evidence classes.
- Migration: none.
- Current release risk: production disk warning must be cleared under separate authority
  before any future deploy.

### Exact approval string

```text
APPROVE B8-R: D1=C_TYPED_SEPARATE; D2=C_MONOTONIC_PROGRESS_PLUS_HISTORY; D3=B_CANONICAL_COMPOSITION_ROW_MEDIA; D4=B_COMPACT_HOME_PROJECTIONS; D5=B_HONEST_EXISTING_BOUNDARIES; D6=B_CALM_BOUNDED_EVIDENCE_GATED; MIGRATION=NONE; SCOPE=IMMEDIATE_B8_ONLY
```

Approval получен 2026-08-13. Реализация начата с RED B8-I0, без миграции и нового
learner store. Production release разрешён отдельным последующим сообщением владельца;
фактические результаты ведутся в
`ROOM_UX_B8_READING_JOURNEY_IMPLEMENTATION_EVIDENCE_2026_08_13.md`.

Owner-live correction authority получена после успешного smoke остальных пунктов B8:
ранняя рабочая строка должна сохраняться и становиться следующим Continue; явная закладка
остаётся независимой. Эта authority supersedes только первоначальную monotonic часть D2.
