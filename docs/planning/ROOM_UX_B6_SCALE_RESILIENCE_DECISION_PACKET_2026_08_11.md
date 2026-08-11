# Reading Room B6 — Scale & Resilience Decision Packet

**Дата:** 2026-08-11
**Статус:** `APPROVED / IMPLEMENTED / D6 OWNER PASS / CLOSED 2026-08-12`
**Программа:** Reading Room B6 из B6–B9 handoff
**Canonical handoff:** [`ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`](./ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md)
**Research baseline:** `36ff3ecec07efd779fa589fed6ac03ef41b8d44a`
**Production snapshot (read-only):** `v3.11.359`
**Evidence:** [`docs/research/room-ux-b6-scale-resilience/2026-08-11/`](../research/room-ux-b6-scale-resilience/2026-08-11/README.md)

**Owner approval:** `D1=cursor+exact-total; D2=history+session; D3=waiting-safe-point; D4=local-only-now+opt-in-RUM-later; D5=packet-budgets; D6=full-physical-matrix`.

**Implementation:** `485ba466`; engineering closure and accepted D6 verdict are recorded in
[`ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md`](./ROOM_UX_B6_SCALE_RESILIENCE_CLOSURE_2026_08_12.md).

---

## 0. Решение в одном абзаце

B6 следует делать как четыре раздельных, owner-gated среза: (1) keyset/cursor
page contract для «Моих текстов» с точным total и лёгкой allowlisted карточкой;
(2) versioned browser presentation-state для Back/reload и best-effort PWA
restore без второго learner store; (3) явная offline/reconnect/update state
machine с безопасной активацией SW только в safe point; (4) RUM сначала
local-only, а production ingestion — только отдельным default-off opt-in
контуром после изменения privacy policy. B0–B5 не переоткрываются: текущий
48-row DOM bound остаётся обязательным инвариантом.

Owner approval получен до кода. После реализации владелец сообщил успешное
выполнение D6 smoke-check; physical/assistive gate принят 2026-08-12. Точные
device/build metadata не были переданы и не выводятся из automation.

---

## 1. Неподвижная граница B0–B5

Каноническая closure:
[`ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md`](./ROOM_UX_MATURITY_OPTION_B_CLOSURE_2026_08_11.md).

В B6 **не обсуждаем заново**:

- иерархию Learning Home, корпусные маршруты и 48-row browse window;
- B2 narration, B3 discovery/genre, B4 cover/reveal и B5 continuity semantics;
- learner truth, FSRS, word-state, review queue, grading и морфологию;
- визуальное направление, ранее принятое владельцем.

Baseline B0–B5: owner accepted, `16/16` unit, `34/34` continuity,
`838/838` responsive matrix, `233/233` i18n, `18/18` canon-version,
`79/79` memory-canon. B6 меняет только scale/resilience contracts и их
presentation.

---

## 2. Линзы решения

Приоритетны R4 (mobile/a11y/UX), R5 (offline trust), R11 (do-no-harm и
cross-surface), R12 (одна истина, bounded scale), R13 (миграции только после
evidence), R15 (privacy/lifecycle) и R16 (ресурсные бюджеты). Для corpus IDs и
защищённых источников остаются обязательными R6/R9 provenance boundaries.

Следствия:

- DOM bound не заменяет query truth и не оправдывает скрытый data cap.
- Presentation-state не имеет права стать вторым learner/progress store.
- Offline UI сообщает реально доступную capability, а не вывод из одного
  `navigator.onLine`.
- Operational RUM нельзя писать в learner event log и нельзя включать вопреки
  текущему публичному privacy promise.
- Изменение общего SW-контракта сериализуется и отдельно проверяет Studio.

---

## 3. Что подтвердил research-only recon

### 3.1 Production owner baseline — только агрегаты

В уже авторизованном production UI прочитано: `115` личных текстов, `77`
групповых, `796` готовых из `26 455` Ben-Yehuda, `209` due, версия
`3.11.359`. Тексты/очереди не открывались; review/grade/status/progress не
создавались; вкладка освобождена без изменений.

Это доказывает реальный owner-content baseline, но **не** 1k/5k scale и не
physical-device acceptance.

### 3.2 Current code facts

| ID | Наблюдение | Доказательство | B6-следствие |
|---|---|---|---|
| C1 | `listTexts({query, limit:500})` возвращает `texts.*`, включая тяжёлые `source_text` и model meta | `public/db/local-db.js:517-537` | карточечному browse нужен отдельный лёгкий contract |
| C2 | Room дважды читает глобальные первые 500 rows и только затем client-side отделяет personal rows | `public/js/library-ui.js:7108-7110`, `8315-8317` | personal scope должен применяться в SQL **до** page limit |
| C3 | Home показывает точный personal `COUNT(*)`, а detail строится из capped list | `public/js/library-ui.js:8059-8066`, `8547-8549` | сейчас возможен честный home count и нечестный detail total одновременно |
| C4 | Search/filter/sort делаются над уже обрезанным `mine`; rows/notes scopes отдельно capped по 300 hits | `public/js/library-ui.js:8494-8508`, `8515-8549` | total и tail search не являются глобально истинными |
| C5 | `ROOM_BROWSE_PAGE=48`; UI создаёт только текущий window | `public/js/library-ui.js:62`, `8548-8557` | B1 bound сохраняем без изменений |
| C6 | Corpus/MyTexts route и filters живут только в JS; `popstate` contract отсутствует | `public/js/library-ui.js:7650-7665`, `8310`, `8563` | reload/Back/PWA eviction теряют presentation-state |
| C7 | SW делает `skipWaiting()` + `clients.claim()`; Room немедленно reload на `controllerchange` | `public/sw.js:16-26`, `259-266`; `public/js/library-ui.js:2854-2869` | update может попасть между write/debounce и требует safe point |
| C8 | Общего Room online/offline/reconnect state нет; `navigator.onLine` проверяют только agent calls | `public/js/library-ui.js:4897`, `5170`, `5280` | capability должна подтверждаться fetch outcome/cache, не одним hint |
| C9 | Существующий `agentUx` идёт в `/api/learner/ingest` | `public/js/library-ui.js:3370-3391` | operational RUM обязан иметь отдельный контур |
| C10 | Публично обещаны «никакой аналитики» и отсутствие автоматических beacon | `docs/PRIVACY.md:3-7`, `70-72` | production RUM без нового owner privacy decision запрещён |

### 3.3 1k/5k scale probe

Изолированный Chromium/OPFS, viewport `380×844`, SW blocked, по 4 KiB
`source_text` + около 4 KiB model meta на текст:

| Метрика | 1 000 personal | 5 000 personal |
|---|---:|---:|
| Фактический SQL total | 1 000 | 5 000 |
| UI summary | `48 / 500` | `48 / 500` |
| Rendered cards | 48 | 48 |
| DOM nodes | 1 048 | 1 048 |
| Open My Texts | 2 395 ms | 5 945 ms |
| Heavy list(500) | 1 886.5 ms / 8 415 085 B | 5 472.6 ms / 8 415 085 B |
| Light list(all) | 940.1 ms / 411 168 B | 4 418.6 ms / 2 055 835 B |
| Поиск первого ID | `1 / 1` | `1 / 1` |
| Поиск последнего ID | `0 / 0` | `0 / 0` |
| Reload | hub, search потерян | hub, search потерян |
| Page errors | 0 | 0 |

Интерпретация строго ограничена:

- B1/DOM — **GREEN и не переоткрывается**.
- B6 query truth/payload/latency/history — **RED до кода**.
- Это по одному recon-run, не p95. Seed time не является product KPI.
- Межконтекстные `usedJSHeapSize` снимки оказались несопоставимы; memory gate
  должен измерять retained delta после контролируемого GC, а не абсолютные
  случайные snapshots.

### 3.4 Offline/SW recon

- При заранее установленном и controlling SW Learning Home открылся online и
  после warm offline reload.
- Network-only вызовы ожидаемо получили `ERR_INTERNET_DISCONNECTED`, но Room не
  показал единого connection/capability state.
- Fresh-install headless path дважды после `controllerchange` reload столкнулся
  с OPFS AccessHandle/VFS collision и остался на loading skeleton. Это
  **harness/update-lifecycle uncertainty**, не доказанный owner-device defect.
- Group-corpus reconnect без reload, cold offline, PWA eviction и pending-update
  в активном reader не доказаны.

### 3.5 Внешние нормативные опоры

- History API задаёт `pushState`/`replaceState` и восстановление через
  `popstate`; состояние должно быть сериализуемым и компактным:
  [MDN pushState](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState),
  [MDN History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API).
- `navigator.onLine` ненадёжен и годится только как hint:
  [MDN Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
- `skipWaiting()` способен смешать старую страницу с новым worker; безопасный
  lifecycle требует осознанного update flow:
  [web.dev Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle),
  [web.dev Updating a PWA](https://web.dev/learn/pwa/update).
- Field Web Vitals и lab — разные типы доказательств; LCP/INP нужно оценивать по
  field distributions, не подменять одним lab-run:
  [web.dev Web Vitals](https://web.dev/articles/vitals),
  [web.dev INP](https://web.dev/articles/inp).
- WCAG 2.2 target minimum — 24×24 CSS px с оговорёнными исключениями; B6 не
  ослабляет уже принятый Room tap-target standard:
  [WCAG 2.2, 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum).

---

## 4. B6 problem register

| ID | Severity | Решаемая проблема | Не означает |
|---|---|---|---|
| B6-P1 | P0 correctness | global 500 cap скрывает rows и даёт ложный `0 / 0` для существующего tail item | что B1 DOM failed |
| B6-P2 | P0 scale | browse тянет тяжёлые blobs; 5k open занимает ~5.9 s в recon | универсальный p95 на всех устройствах |
| B6-P3 | P1 resilience | Back/reload не восстанавливают route/filter/search/visible anchor | сохранение learner progress в новом store |
| B6-P4 | P1 trust | нет capability-aware offline/reconnect UI; network projections могут выглядеть пустыми | что warm local Room полностью offline-broken |
| B6-P5 | P0 lifecycle | immediate SW activation/reload не привязан к safe write/reader point | доказанный physical-device data-loss |
| B6-P6 | P0 privacy | requested production RUM конфликтует с текущей policy и learner-log boundary | запрет local diagnostics |
| B6-P7 | Evidence gap | iPhone/Android/AT/PWA eviction и reconnect не имеют owner-live evidence | автоматизация как замена physical acceptance |

---

## 5. D1 — Scale contract

### Рассмотренные варианты

| Вариант | Плюс | Минус | Решение |
|---|---|---|---|
| A. SQL `OFFSET/LIMIT` | самый малый diff | latency растёт с offset; дрейф/дубли при изменении списка | reject |
| B. Keyset cursor + matched count | bounded payload; стабильный next page; честный total | нужен cursor на каждый sort и contract tests | **recommend** |
| C. Загрузить все light rows и фильтровать в JS | сохраняет текущую логику | 5k уже ~2.06 MB/4.42 s; memory растёт линейно | reject |

### Рекомендуемый DB contract v1

```js
listPersonalTextsPage({
  cursor: null,
  limit: 48,              // hard max 96
  sort: 'opened_desc',
  query: '',              // metadata only
  level: '',
  tags: [],
  tagMode: 'all',
  smart: '',
  scope: 'texts'
}) -> {
  items: TextCard[],
  nextCursor: string | null,
  matchedTotal: number,
  snapshot: string
}
```

Обязательные свойства:

1. Personal predicate применяется в SQL до `LIMIT`: без corpus и
   group-corpus materializations.
2. `items` — allowlist карточечных полей. Запрещены `source_text`, полный
   `table_model_meta_json`, caption/media blobs и произвольный `texts.*`.
3. Каждый sort получает deterministic tuple и завершается стабильным `id`.
   Cursor versioned, opaque для UI и связан с predicate/sort fingerprint.
4. `matchedTotal` считается по тому же predicate в одной read transaction.
   Нельзя показывать capped число как полный total.
5. Metadata query соответствует UI promise: title/topic/source/level/tags.
   Поиск по строкам/заметкам — отдельный bounded ID query с cursor/total, без
   скрытого `300` cap.
6. Изменение filters/sort или локальная mutation инвалидирует cursor и начинает
   page 1; already rendered cards не становятся learner truth.
7. Схема/индекс **не меняются заранее**. Сначала `EXPLAIN QUERY PLAN` и 5k
   benchmark; migration идёт отдельным R13 approval только если budget не
   достигается без неё.
8. UI window остаётся `48`; next page заменяет/дополняет bounded view по
   утверждённому virtual/window policy, а DOM ceiling B0 не повышается.

---

## 6. D2 — Presentation-state без второго learner store

### Рекомендуемая модель

```text
URL/hash (структурный маршрут, без контента)
        ↓
history.state v1 (route + presentation filters + anchor)
        ↓
sessionStorage mirror (same-tab best effort, max 8 KiB, TTL 24 h)
        ↓
fallback к ближайшему валидному parent route с честным сообщением
```

Разделение операций:

- `pushState`: переход hub → corpus → drill → reader и обратно.
- `replaceState`: query/filter/sort, visible count, focus/scroll anchor.
- `popstate`: только восстановление view; **никаких** grade, progress, status,
  last-opened или review writes.
- Перед unload/pagehide presentation snapshot синхронно обновляется; learner
  progress остаётся в существующем canonical DB path.

Allowlist `history.state`:

```js
{
  v: 1,
  surface: 'hub' | 'corpus' | 'mytexts' | 'group' | 'reader',
  corpus: 'benyehuda' | 'mytexts' | 'group:<opaque-local-id>',
  drill: { level, eraId, authorId, workId },
  filters: { q, level, tags, tagMode, scope, sort, smart },
  visible: 48,
  anchor: { itemId, rowIndex }
}
```

Privacy/bounds:

- В URL разрешены только versioned structural keys и opaque local IDs.
- Запрещены title, source text, note, translation, selected word, search query,
  user/learner ID и raw referrer. Query хранится только browser-local в
  `history.state`/session mirror.
- Serialized state ≤8 KiB; `q` ≤256 code points; tags ≤12; unknown keys drop.
- session mirror не sync/export/telemetry, не переживает новый tab как promise и
  не считается learner truth. При iOS eviction restore только best effort;
  невалидное/устаревшее состояние ведёт к parent route, не к silent guess.

Вариант без session mirror проще и приватнее, но не выполняет PWA-eviction
best-effort. Рекомендация: history + bounded session mirror.

---

## 7. D3 — Offline, reconnect и safe SW update

### Capability state machine

| State | Что известно | UI/действие |
|---|---|---|
| `online` | последний required fetch успешен | обычный UI |
| `offline-ready` | shell + выбранный local work доступны | «Доступно офлайн», local actions enabled |
| `offline-partial` | shell local, network projection/work body отсутствует | точная причина и доступные альтернативы; не пустой каталог |
| `reconnecting` | online event/hint пришёл, capability ещё проверяется | тихий live status, один deduped refresh |
| `degraded-error` | fetch провалился при `onLine=true` | retry; не маркировать автоматически offline |
| `update-ready` | новый worker waiting | ненавязчивое обновление в safe point |
| `update-deferred-reader` | reader/write/debounce активен | не reload; сначала canonical flush/read-back |

Правила:

- `online/offline` events запускают проверку, но истину даёт fetch/cache result.
- Reconnect refresh обновляет только network projections: group entitlements,
  group catalogs, remote config/status. LocalDb не очищается и не rebinding.
- Refresh deduped, abortable, с backoff; отсутствие сети не превращается в
  «0 материалов».
- Warm/cold cache и protected-group entitlement показываются раздельно.

### Рекомендуемый SW lifecycle

Перейти от unconditional install-time `skipWaiting()` к waiting worker + явной
safe activation:

1. Новый SW устанавливает полный versioned cache и остаётся waiting.
2. Room/Studio показывают update-ready state.
3. При отсутствии active write/reader debounce клиент просит `SKIP_WAITING`.
4. Если reader активен, существующий progress path flush + read-back завершает
   запись; затем activation/reload восстанавливает presentation-state.
5. `controllerchange` не делает безусловный reload в unsafe point.
6. Shared SW slice тестируется отдельно на Room и Studio и не совмещается с B7.

Fresh-install headless OPFS collision из recon становится обязательным red
regression test, но owner-device claim появляется только после physical matrix.

---

## 8. D4 — Privacy-safe RUM

### Варианты

| Вариант | Privacy | Полевая видимость | Решение |
|---|---|---|---|
| R0 lab-only | соответствует текущей policy | нет field distributions | допустимый минимум |
| R1 local-only bounded ring + explicit export | данные не уходят автоматически | owner/beta может прислать diagnostic snapshot | **первый рекомендуемый этап** |
| R2 dedicated opt-in aggregate endpoint | требует policy/consent/retention решения | даёт production LCP/INP/open/return/error | **только после отдельного approval** |
| R3 reuse `/api/learner/ingest` | смешивает operational и learner truth | технически быстро | reject |

### Allowlist schema для R2, если владелец его разрешит

Разрешены только:

- `schema_version`, `app_version`, `surface='room'`, `event` closed enum;
- coarse `device_class`, `display_mode`, `connection_class` buckets;
- `lcp_ms`, `inp_ms`, `cls_bucket`, Room open/return latency bucket;
- closed `error_code`, `sample_rate`, UTC day bucket.

Запрещены рекурсивным schema test:

- user/learner/device/session/text/work/sentence/note IDs;
- title, source, translation, selected token, query, tags, URL, pathname,
  referrer, UA string, DOM selector, attribution target;
- exact library/due/known-word counts;
- arbitrary error message/stack/request body;
- learner grade, status, progress или morph payload.

Operational RUM — отдельная таблица/endpoint/retention job, не learner event log.
Предлагаемые defaults для owner decision: opt-in only, sample 10%, retention 30
дней, минимум 20 samples перед dashboard aggregation, без third-party endpoint.
Measurement library, если нужна, vendored/pinned locally; CDN запрещён.

До включения R2 обязательны обновлённый `docs/PRIVACY.md`, consent UX, data-flow
review, delete/retention proof и server-log/IP review. Пока policy обещает
«никакой аналитики», R2 default-off и не деплоится.

---

## 9. Предлагаемая последовательность после approval

| Slice | Содержание | Deploy boundary |
|---|---|---|
| B6.0 | committed red gates 1k/5k, tail-search, history, offline/update harness | no prod |
| B6.1 | DB page/count/cursor contract и query-plan evidence | local only до green |
| B6.2 | Room browse integration + presentation-state | отдельный beta/prod gate |
| B6.3 | offline/reconnect + shared SW safe activation | сериализованный Room+Studio deploy |
| B6.4a | local-only diagnostic ring | отдельный privacy gate |
| B6.4b | optional opt-in RUM endpoint/policy | только новый owner approval |
| B6.5 | automated matrix, physical devices, owner-live acceptance | B6 closure only |

Никакого B6→B9 mega-release. Между slices — owner stop/go и точный served
version/read-back.

---

## 10. Acceptance gates и бюджеты

### Correctness/scale

- 1k и 5k exact `matchedTotal`; первый, средний и последний ID находятся во
  всех утверждённых scopes.
- Page size ≤48, hard API max 96, `nextCursor` deterministic, no duplicate/skip
  при stable snapshot; mutation вызывает явный restart.
- Один 48-card payload ≤256 KiB и не содержит heavy/forbidden fields.
- При 5k reference desktop: warm page query p50 ≤250 ms, p95 ≤500 ms; cold
  first page ≤900 ms. Это proposal budget D5, не текущий achieved result.
- Search response после 200 ms debounce: p95 ≤600 ms на reference desktop.
- DOM ≤B0 ceiling `2 438`, visible cards ≤48, long tasks >50 ms = 0 в
  open/search/load/back сценарии.
- После CDP GC retained heap delta после 20 cycles ≤10 MiB и без монотонного
  роста; дополнительно heap diff не содержит retained detached card trees.

### History/resilience

- Browser Back/Forward и reload восстанавливают route/filter/sort/visible
  anchor; не создают learner writes.
- State ≤8 KiB; запрещённые поля отсутствуют в URL/history/RUM.
- Corrupt/old state fail-closed к parent route с видимым объяснением.
- Warm offline local content открывается; missing remote body/entitlement имеет
  честный `offline-partial`, не пустую «истину».
- Reconnect обновляет network projections без full reload и без LocalDb writes.
- Pending SW не reload активный reader; canonical progress flush/read-back
  завершается до activation.
- `review_log` row count/checksum до и после B6 navigation/offline/update gates
  неизменны.

### RUM/privacy

- R1 local ring bounded по count/bytes/TTL и экспортируется только явным
  действием.
- Для R2 recursive forbidden-field tests, opt-in default-off, sample/retention
  job, deletion proof и обновлённая privacy policy — обязательные red gates.
- Lab automation не называется field, physical-device или owner-live evidence.

---

## 11. Evidence/device matrix до B6 closure

| Среда | Что требуется | Тип доказательства |
|---|---|---|
| Win11 Chrome desktop, owner profile | counts/read-only browse, Back/reload, update safe point | owner-live, без grade/status writes |
| Chromium 380 RU + HE/RTL, light/dark | 1k/5k scale, DOM, history, offline/reconnect | automation |
| Chromium desktop 1280 + 200% zoom | keyboard/focus/order/targets | automation + manual |
| iPhone Safari + standalone PWA | reload, process eviction best-effort, warm/cold offline, pending update | physical owner-device |
| Android Chrome PWA | offline/reconnect, update, 5k synthetic if device capacity позволяет | physical device |
| NVDA + Chrome | route announcements, result count, filter state, reconnect status | assistive manual |
| VoiceOver + Safari | rotor/order/focus после Back/update, RTL | assistive physical |
| TalkBack + Android Chrome | browse/filter/load/reconnect announcements | assistive physical |

Target controls не ниже WCAG 24×24 CSS px; сохраняется более строгий текущий
Room target там, где он уже принят. Ни screenshot, ни headless trace не
подменяют VoiceOver/TalkBack/owner acceptance.

---

## 12. Утверждённые решения владельца

| Decision | Рекомендация | Если не утвердить |
|---|---|---|
| **D1 Data** | keyset cursor + exact matched total + light card allowlist | B6 correctness/scale остаётся RED |
| **D2 State** | versioned history.state + bounded session mirror | Back/reload можно закрыть, PWA eviction — только explicit no-go |
| **D3 SW** | waiting worker, activation only at safe point; shared serialized slice | update-lifecycle остаётся RED |
| **D4 RUM** | R1 local-only сейчас; R2 opt-in 10%/30d только после отдельной privacy approval | field metrics остаются неизвестны, что честно допустимо |
| **D5 Budgets** | принять §10 как provisional reference budgets | перед кодом назначить другие численные budgets |
| **D6 Evidence** | physical iPhone/Android + NVDA/VoiceOver/TalkBack обязательны до GA claim | B6 может быть beta/automated, но не GA/owner-live closed |

Фактически утверждённая строка:

```text
APPROVE B6-R: D1=cursor+exact-total; D2=history+session;
D3=waiting-safe-point; D4=local-only-now+opt-in-RUM-later;
D5=packet-budgets; D6=full-physical-matrix.
```

Решение зафиксировано без изменений. D4 не разрешает production ingestion.
D6 завершён явным owner-reported PASS smoke-check; границы точности evidence
зафиксированы в physical packet.

---

## 13. Предварительный allowlist после approval

Этот allowlist стал границей выполненных implementation slices; расширения за
его пределы по-прежнему требуют нового решения.

### B6.0–B6.2

- `public/db/local-db.js`
- `public/js/library-ui.js`
- `public/library.html` только если нужен versioned module include
- locale-файлы только для новых, утверждённых status strings
- новые `scripts/premium/room-b6-*.js` и точечные tests
- research evidence/decision/closure docs

### B6.3 shared SW

- `public/sw.js`
- Room SW registration/update handler
- Studio SW registration/update handler — только lifecycle parity, без Studio UX
- version constant и точечные Room+Studio SW tests

### B6.4b, только отдельный D4 approval

- отдельный Room RUM client module
- отдельный server route/repository/migration/retention test
- `docs/PRIVACY.md` и consent copy
- schema/forbidden-field/privacy tests

### Stop list

- не менять B0–B5 visual/narration/discovery/continuity decisions;
- не менять `fsrs-core.js`, learner grading, `review_log`, word-state oracles,
  morph/lemma canon, media timing/provenance;
- не делать второй progress/learner store и silent inference;
- не писать RUM в `/api/learner/ingest`;
- не отправлять content/query/title/URL/IDs/DOM attribution;
- не добавлять AI recommendations, quiz/feed/gamification/cover grid;
- не делать schema/index migration без query-plan + 5k evidence;
- не совмещать B6 с B7–B9 и не называть automation owner-live/GA.
